from django.db import models
from django.contrib import admin
from django.urls import re_path as url

from autosave.mixins import AdminAutoSaveMixin


class MyModel(models.Model):
    name = models.CharField(max_length=50)
    date_modified = models.DateTimeField(auto_now=True)


@admin.register(MyModel)
class MyAdmin(AdminAutoSaveMixin, admin.ModelAdmin):
    autosave_last_modified_field = 'date_modified'


admin.autodiscover()
urlpatterns = [
    url(r'^admin/', admin.site.urls),
]
