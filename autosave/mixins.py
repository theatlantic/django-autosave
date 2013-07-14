import re
import copy
import time
import json
import functools
import textwrap
from datetime import datetime

from django.template.response import TemplateResponse
from django.contrib import messages
from django.contrib.admin.util import unquote
from django.conf import settings
from django.core.urlresolvers import reverse
from django.core.exceptions import ImproperlyConfigured, PermissionDenied
from django.db.models.fields import FieldDoesNotExist
from django.http import HttpResponse, Http404
from django.utils.encoding import force_unicode
from django.utils.html import escape
from django.utils.safestring import mark_safe
from django.utils.translation import ugettext as _


autosave_js_media_re = re.compile(ur"""(?ixs)
    # flags: i = case-insensitive; x = free spacing; s = re.DOTALL
    (<script\s+                 # Tag name
     (?: [^>"']                 # Tag and attribute names, etc.
       | "[^"]*"                #     and quoted attribute values
       | '[^']*'
     )*?
    \s src                      # The target attribute name, as a whole word
    \s* = \s*                   # Attribute name-value delimiter
    )
    (['"])                      # The target attribute value
    (.*autosave_variables\.js)  #   surrounded by single or double quotes
    \2
    ((?: [^>"']                 # Any remaining characters 
      | "[^"]*"                 #     and quoted attribute values
      | '[^']*'
    )*
    >\s*?</script>)
""")


class AdminAutoSaveMixin(object):

    autosave_last_modified_field = None

    def get_form(self, request, obj=None, **kwargs):
        """
        This is a filthy hack that allows us to return the posted
        data without saving by forcing validation to fail with no errors.
        """
        Form = super(AdminAutoSaveMixin, self).get_form(request, obj=obj, **kwargs)

        if 'is_retrieved_from_autosave' in request.POST:
            IllegalForm = copy.deepcopy(Form)
            def is_valid(self):
                return False
            IllegalForm.is_valid = is_valid

            if obj:
                refresh_action = 'view the original'
            else:
                refresh_action = 'clear the form'

            messages.info(request, mark_safe((
                'Successfully loaded from your latest autosave. '
                '<a href="">Click here</a> to %(refresh_action)s. '
                '<a href="#delete-autosave">[discard autosave]</a>'
                ) % {
                    'refresh_action': refresh_action,
                }))
            return IllegalForm

        return Form

    def autosave_js(self, request, object_id, extra_context=None):
        opts = self.model._meta
        info = (opts.app_label, opts.module_name)

        try:
            object_id = int(unquote(object_id))
        except ValueError:
            return HttpResponse(u"", status=404, mimetype='application/x-javascript')

        obj = None
        updated = None

        # Raise exception if the admin doesn't have a 'autosave_last_modified_field' property
        if not self.autosave_last_modified_field:
            raise ImproperlyConfigured((
                u"Autosave is not configured correctly. %(cls_name)s "
                u"is missing property 'autosave_last_modified_field', which "
                u"should be set to the model's last updated datetime field.") % {
                    'cls_name': ".".join([self.__module__, self.__class__.__name__]),
                })

        # Raise exception if self.autosave_last_modified_field is not set
        try:
            opts.get_field_by_name(self.autosave_last_modified_field)
        except FieldDoesNotExist:
            raise

        if not object_id:
            autosave_url = reverse("admin:%s_%s_add" % info)
        else:
            autosave_url = reverse("admin:%s_%s_change" % info, args=[str(object_id)])
            try:
                obj = self.get_object(request, object_id)
            except (ValueError, self.model.DoesNotExist):
                raise Http404(_('%(name)s object with primary key %(key)r does not exist.') % {
                    'name': force_unicode(opts.verbose_name),
                    'key': escape(object_id),
                })
            else:
                updated = getattr(obj, self.autosave_last_modified_field, None)
                # Make sure date modified time doesn't predate Unix-time.
                # I'm pretty confident they didn't do any Django autosaving in 1969.
                updated = max(updated, datetime.datetime(year=1970, month=1, day=1))

        if obj and not self.has_change_permission(request, obj):
            raise PermissionDenied
        elif not obj and not self.has_add_permission(request):
            raise PermissionDenied

        js_vars = {
            'autosave_url': autosave_url,
            'is_add_view': not(object_id),
            'server_time_epoch': time.mktime(datetime.now().timetuple()),
            'last_updated_epoch': time.mktime(updated.timetuple()) if updated else None,
            'is_recovered_autosave': bool(request.GET.get('is_recovered')),
        }

        response_js = textwrap.dedent("""
            var DjangoAutosave = (typeof window.DjangoAutosave != 'undefined')
                               ? DjangoAutosave
                               : {{}};
            DjangoAutosave.config = (function() {{
                var config = {config_data};
                config.client_time_epoch = Math.round((new Date()).getTime()/1000, 0);
                config.client_time_offset = config.client_time_epoch - config.server_time_epoch;
                return config;
            }})();
        """).strip().format(config_data=json.dumps(js_vars, indent=4, sort_keys=True))
        return HttpResponse(response_js, mimetype='application/x-javascript')

    def get_urls(self):
        """Adds a last-modified checker to the admin urls."""
        try:
            from django.conf.urls.defaults import patterns, url
        except ImportError:
            from django.conf.urls import patterns, url

        opts = self.model._meta
        info = (opts.app_label, opts.module_name)

        # Use admin_site.admin_view to add permission checking
        def wrap(view):
            def wrapper(*args, **kwargs):
                return self.admin_site.admin_view(view)(*args, **kwargs)
            return functools.update_wrapper(wrapper, view)

        # This has to be \w because if it's not, parameters following the obj_id will be
        # caught up in the regular change_view url pattern, and 500.
        urlpatterns = patterns('',
            url(r'^(.+)/autosave_variables\.js',
                wrap(self.autosave_js),
                name="%s_%s_autosave_js" % info),)
        urlpatterns += super(AdminAutoSaveMixin, self).get_urls()
        return urlpatterns

    @property
    def media(self):
        opts = self.model._meta
        info = (opts.app_label, opts.module_name)

        media = super(AdminAutoSaveMixin, self).media
        media.add_js((
            # We call admin:%(app_label)s_%(model)s_autosave_js with 0 (the pk)
            # with the intention of doing a string replace on the url in
            # render_change_form(), where we know what the primary key is.
            #
            # This is hacky, but necessary since the add_view does not have a
            # primary key, given that the object has not yet been saved.
            reverse('admin:%s_%s_autosave_js' % info, args=[0]),
            "%sautosave/js/autosave.js" % settings.STATIC_URL,
        ))
        return media

    def render_change_form(self, request, context, add=False, obj=None, **kwargs):
        obj_pk = getattr(obj, 'pk', None)
        media = context.pop('media', None)
        if media:
            get_params = u''
            if 'is_retrieved_from_autosave' in request.POST:
                get_params = u'?is_recovered=1'

            def replacement(matchobj):
                tag_start, quote_char, src_val, tag_end = matchobj.groups()
                src_val += get_params
                if not add and obj_pk:
                    src_val = re.sub(r'(?<=/)0(?=/autosave_variables\.js)', str(obj_pk), src_val)
                return u"".join([tag_start, quote_char, src_val, quote_char, tag_end])

            media = autosave_js_media_re.sub(replacement, unicode(media))

            # This is our hacky string-replacement, described more fully
            # in the comments for the `media` @property
            # if not add and obj.pk:
            #     media = re.sub(r'/0/(autosave_variables\.js)',
            #         r'/%d/\1%s' % (obj_pk, get_params),
            #         unicode(media))
            context['media'] = mark_safe(media)
        return super(AdminAutoSaveMixin, self).render_change_form(
                request, context, add=add, obj=obj, **kwargs)

    def changelist_view(self, request, extra_context=None):
        response = super(AdminAutoSaveMixin, self).changelist_view(request, extra_context)
        if isinstance(response, TemplateResponse):
            context = response.context_data
            media = context.pop('media', None)
            media = autosave_js_media_re.sub(u'', unicode(media))
            response.context_data['media'] = mark_safe(media)
        return response