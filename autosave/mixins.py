import time
import json
import functools
import textwrap
from datetime import datetime
from urlparse import urlparse

from django import forms
from django.contrib import messages
from django.contrib.admin.models import LogEntry, ADDITION
try:
    from django.contrib.admin.utils import unquote
except ImportError:
    from django.contrib.admin.util import unquote
from django.contrib.contenttypes.models import ContentType
from django.core.urlresolvers import reverse
from django.core.exceptions import ImproperlyConfigured, PermissionDenied
from django.db.models.fields import FieldDoesNotExist
try:
    from django.forms.utils import ErrorDict
except ImportError:
    from django.forms.util import ErrorDict
from django.http import HttpResponse, Http404
from django.utils.encoding import force_unicode
from django.utils.html import escape
from django.utils.safestring import mark_safe
from django.utils.translation import ugettext as _


class AdminAutoSaveMixin(object):

    autosave_last_modified_field = None

    def get_form(self, request, obj=None, **kwargs):
        """
        This is a filthy hack that allows us to return the posted
        data without saving by forcing validation to fail with no errors.
        """
        if 'is_retrieved_from_autosave' in request.POST:
            class IllegalForm(kwargs.get('form', self.form)):
                def is_valid(self): return False
                def full_clean(self):
                    self._errors = ErrorDict()
                    if hasattr(self, 'cleaned_data'):
                        del self.cleaned_data

            kwargs['form'] = IllegalForm

            messages.info(request, mark_safe((
                'Successfully loaded from your latest autosave. '
                '<a href="">Click here</a> to %(refresh_action)s. '
                '<a href="#delete-autosave">[discard autosave]</a>'
                ) % {
                    'refresh_action': 'view the original' if obj else 'clear the form',
                }))

        return super(AdminAutoSaveMixin, self).get_form(request, obj, **kwargs)

    def autosave_js(self, request, object_id, extra_context=None):
        opts = self.model._meta
        info = (opts.app_label, getattr(opts, 'model_name', None) or getattr(opts, 'module_name', None))

        try:
            object_id = int(unquote(object_id))
        except ValueError:
            return HttpResponse(u"", status=404, content_type='application/x-javascript')

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
            add_log_entries = LogEntry.objects.filter(
                    user=request.user,
                    content_type=ContentType.objects.get_for_model(self.model),
                    action_flag=ADDITION)
            try:
                updated = add_log_entries[0].action_time
            except IndexError:
                pass
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
                updated = max(updated, datetime(year=1970, month=1, day=1))

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
        return HttpResponse(response_js, content_type='application/x-javascript')

    def get_urls(self):
        """Adds a last-modified checker to the admin urls."""
        try:
            from django.conf.urls.defaults import patterns, url
        except ImportError:
            from django.conf.urls import patterns, url

        opts = self.model._meta
        info = (opts.app_label, getattr(opts, 'model_name', None) or getattr(opts, 'module_name', None))

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

    def autosave_media(self, obj=None, get_params=''):
        """
        Provides a Media object containing autosave-related javascript files.

        This can be appended to the media in add_view and change_view, and
        enables us to pull autosave information specific to a given object.
        """
        opts = self.model._meta
        info = (opts.app_label, getattr(opts, 'model_name', None) or getattr(opts, 'module_name', None))

        pk = getattr(obj, 'pk', None) or 0

        return forms.Media(js=(
            reverse('admin:%s_%s_autosave_js' % info, args=[pk]) + get_params,
            "autosave/js/autosave.js?v=2",
        ))

    def set_autosave_flag(self, request, response):
        """
        If the autosave_success variable was set by javascript, set it to 1 to
        signal that a save has successfully happened.
        """
        if request.COOKIES.get("autosave_success", False) == '0':
            referer_path = urlparse(request.META['HTTP_REFERER']).path
            response.set_cookie("autosave_success", 1, path=referer_path)
        return response

    def response_add(self, request, *args, **kwargs):
        response = super(AdminAutoSaveMixin, self).response_add(request, *args, **kwargs)
        response = self.set_autosave_flag(request, response)
        return response

    def response_change(self, request, obj):
        response = super(AdminAutoSaveMixin, self).response_change(request, obj)
        response = self.set_autosave_flag(request, response)
        return response

    def render_change_form(self, request, context, add=False, obj=None, **kwargs):
        if 'media' in context:
            get_params = u''
            if 'is_retrieved_from_autosave' in request.POST:
                get_params = u'?is_recovered=1'
            autosave_media = self.autosave_media(obj, get_params=get_params)
            if isinstance(context['media'], basestring):
                autosave_media = unicode(autosave_media)
            context['media'] += autosave_media
        return super(AdminAutoSaveMixin, self).render_change_form(
                request, context, add=add, obj=obj, **kwargs)
