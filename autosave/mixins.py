import copy
import time
import simplejson as json
from django.contrib import messages
from django.conf.urls.defaults import url, patterns
from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.core.exceptions import ImproperlyConfigured

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

            messages.info(request, "Loaded from your latest Autosave. To use it, press Save and Continue. To abandon the changes, refresh.")
            return IllegalForm

        return Form


    def last_updated(self, request, obj_id):
        """
        Simple JSON view to get the last updated time in both ISO and epoch.
        Is based on the admin's "last_updated_field".

        class MyAdmin(admin.ModelAdmin):
            # stuff

            autosave_last_modified_field = 'last_modified'

        """
        admin_class_name = ".".join([self.__module__, self.__class__.__name__]) # Used in error messages
        obj = get_object_or_404(self.model, id=obj_id)

        # Break if the admin doesn't have a 'autosave_last_modified_field' property
        if not self.autosave_last_modified_field:
            error_message = """Autosave isn't set up correctly. On {0}, you should
            set a property called 'autosave_last_modified_field' to the name of your model's
            last updated datetime field. """.format(admin_class_name)
            raise ImproperlyConfigured(error_message)

        updated = getattr(obj, self.autosave_last_modified_field, None)
        # Break if the field doesn't exist
        if not updated:
            error_message = """Autosave isn't set up correctly. {admin}.autosave_last_modified_field is
            set to '{field}', which isn't a valid field on the model. """.format(
                admin=admin_class_name,
                field=self.autosave_last_modified_field,
                )
            raise ImproperlyConfigured(error_message)

        output = {
            'last_updated': updated.isoformat(),
            'last_updated_epoch': time.mktime(updated.timetuple()),
        }
        output = json.dumps(output)
        return HttpResponse(output, mimetype="application/json")


    def get_urls(self):
        """Adds a last-modified checker to the admin urls."""

        urls = super(AdminAutoSaveMixin, self).get_urls()
        extra_urls = patterns('',
            url(r'^(?P<obj_id>\d+)/last-modified/$', self.last_updated),
        )
        return extra_urls + urls

    @property
    def media(self):
        base_media = super(AdminAutoSaveMixin, self).media
        base_media.add_js((
            "%sautosave/js/autosave.js" % settings.STATIC_URL,
        ))
        base_media.add_css({
            'all': {},
        })
        return base_media

    # class Media:
        # js = ('autosave/js/autosave.js', )
