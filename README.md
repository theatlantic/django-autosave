# Django Autosave

Gives users the option to recover their unsaved changes in the event of a browser crash or lost connection.

> **Note:**
> 
> * Version 1.0 supports Django >= 1.11, Python 2.7, >= 3.5.
> * Version 2.0 will drop support for Django < 2.0.

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
