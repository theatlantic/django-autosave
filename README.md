# Django Autosave

Gives users the option to recover their unsaved changes in the event of a browser crash or lost connection.

## Setup

Add ``autosave`` to ``INSTALLED_APPS``, and add the mixin to your admin.ModelAdmin

    from autosave.mixins import AdminAutoSaveMixin

    class MyAdmin(AdminAutoSaveMixin, admin.ModelAdmin):
        # ...

        autosave_last_modified_field = 'date_modified'

Set the property ``autosave_last_modified_field`` to the name of your last modified field.

### Behavior

We assume you *might* want to revert your changes if

1. The autosaved version is newer than the most recent saved change to the model (hence the last updated field)
2. The contents in autosave is different than the model

If both of those conditions are met, we throw up a banner with "revert" and "continue" links. Revert will load up the stored
changes, continuing will abandon them and start creating new save points.

### Known issues

The contents of a form are autosaved by examining input and textarea value fields. Some javascript-heavy custom
form widgets only write to the input field they replace when the form is submitted (instead of every time the data changes). 
As a result, when autosave serializes the form data, the values can be out of date.

There is support for TinyMCE which will ask it to "save" (serialize)
the contents of its editors back to their sources (we only really care
about TEXTAREA elements) before we create the autosave backup.