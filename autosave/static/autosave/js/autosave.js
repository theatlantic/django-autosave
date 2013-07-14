var DjangoAutosave = (window.DjangoAutosave) ? DjangoAutosave : {};

(function($) {

    $(document).ready(function() {
        // If django-ckeditor is installed, wait until ckeditor has modified
        // the textarea instances.
        // If this is not done, we will occasionally prompt the user erroneously
        // that they have changes in their autosave, when all that has happened is
        // that CKEDITOR has modified the value with html through its content filters.
        if (typeof window.CKEDITOR !== 'undefined' && $('.django-ckeditor-textarea').length) {
            DjangoAutosave.onCKEditorLoad(DjangoAutosave.setup);
        } else {
            DjangoAutosave.setup();
        }
    });

    $(document).on('click', '[href=#ignore-autosaved]', function(e) {
        // Clicking this should remove the banner and start autosaving again, replacing
        // the old version.
        e.preventDefault();
        $(e.target).closest('li').fadeOut('fast');
        DjangoAutosave.save();
        setTimeout(DjangoAutosave.save, 5000);
    });

    $(document).on('click', '[href="#delete-autosave"]', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (confirm("Are you sure you want to delete your autosave?")) {
            $(e.target).closest('li').fadeOut('fast');
            DjangoAutosave.clear();
            if (DjangoAutosave.config.is_recovered_autosave) {
                window.location.reload(true);
            }
        }
    });

    // Regenerates the form to submit old data, and posts it.
    $(document).on('click', '[href=#revert-to-autosaved]', function(e) {
        e.preventDefault();

        // Generate new form data
        var $form = $('form');
        // Disable the existing form
        $form.find(':input:not([name="csrfmiddlewaretoken"])').prop('disabled', true);
        var data = DjangoAutosave.retrieve();

        $.each(data.formValues, function(i, attributes) {
            $('<input type="hidden" />').attr(attributes).appendTo($form);
        });

        // The CSRF token can change and cause 403's. Always use the current one.
        if (DjangoAutosave.csrf_token) {
            $(':input[name="csrfmiddlewaretoken"]').val(DjangoAutosave.csrf_token);
        }

        // This adds an element to the page that tells Django forms
        // to deliberately fail validation, and return the autosaved contents.
        $form.append($('<input type="hidden" name="is_retrieved_from_autosave" value="1"/>'));
        $form.submit();
    });

    // django-locking (version >= 2.2.0) support
    $(document).on('locking:disabled', function() { $('#autosave-message').hide(); });
    $(document).on('locking:enabled',  function() { $('#autosave-message').show(); });

    DjangoAutosave.setup = function() {
        if (typeof DjangoAutosave.config != 'object') {
            return false;
        }

        if (window.localStorage === undefined){
            // Requires local storage.
            return false;
        }

        DjangoAutosave.csrf_token = $('[name="csrfmiddlewaretoken"]').val();

        var data = DjangoAutosave.retrieve();
        var config = DjangoAutosave.config;
        var last_updated;

        if (config.last_updated_epoch === null && !config.is_add_view) {
            // No date means this object doesn't exist yet.
            return false;
        }
        if (config.is_add_view) {
            // On add_view, there is no timestamp for comparison.
            // Also no risk of changes being overwritten.
            last_updated = 0;
        } else {
            if (config.last_updated_epoch === null) {
                return false;
            }
            // 15 = an arbitrary margin of error (in seconds) to deal with clock sync
            last_updated = 15 + config.last_updated_epoch + config.client_time_offset;
        }

        // If last_updated is more recent, than this story was probably edited by someone else/another device.
        // If the content is not different, the user probably just closed a window or went to get coffee and close a tab,
        // but had already saved their work.
        if (!config.is_recovered_autosave && data.timestamp > last_updated && DjangoAutosave.contentIsDifferent()) {
            // Suggest revert
            DjangoAutosave.suggestRevert(data.timestamp);
        } else {
            // Start Saving Again
            setTimeout(DjangoAutosave.save, 5000);
        }
    };

    DjangoAutosave.onCKEditorLoad = function(callback) {
        if (typeof window.CKEDITOR === 'undefined') {
            return callback();
        }
        var $textareas = $(".django-ckeditor-textarea");

        var totalEditors = $textareas.length;
        var readyHandlerCalled = {};

        var loaded = false;

        switch (CKEDITOR.status) {
            case 'basic_ready':
            case 'ready':
                return callback();
            default:
                $textareas.each(function(i, textarea) {
                    var $textarea = $(textarea);
                    var editor = $textarea.data('ckeditorInstance');
                    if (editor && editor.status == 'ready') {
                        totalEditors--;
                    }
                });
                if (totalEditors === 0) {
                    return callback();
                }
                CKEDITOR.on('instanceReady', function(e) {
                    var editor = e.editor;
                    var textarea = editor.element.$;
                    var dataId = textarea[$.expando];
                    if (dataId) {
                        if (readyHandlerCalled[dataId]) {
                            return;
                        } else {
                            readyHandlerCalled[dataId] = true;
                        }
                    }
                    totalEditors--;
                    if (totalEditors === 0 && !loaded) {
                        loaded = true;
                        callback();
                    }
                });
        }

        // If CKEDITOR doesn't finish loading for some reason, execute callback
        // after a reasonable timeout
        setTimeout(function() {
            if (!loaded) {
                callback();
            }
        }, 15000);
    };

    DjangoAutosave.contentIsDifferent = function() {
        // Determines if the autosaved data is different than the current version.

        var savedData = DjangoAutosave.retrieve();
        var formValues = DjangoAutosave.captureForm();

        // If they're not even the same length, they're different.
        if (savedData.formValues.length !== formValues.length) {
            return true;
        }
        for (var i = savedData.formValues.length - 1; i >= 0; i--) {
            // Skip comparison of the csrfmiddlewaretoken value
            if (savedData.formValues[i].name === 'csrfmiddlewaretoken') { continue; }
            if (savedData.formValues[i].value !== formValues[i].value) {
                // The values for fields should be identical
                return true;
            }
        }
        return false;
    };

    DjangoAutosave.suggestRevert = function(last_autosaved) {
        var msg = [
            "It looks like you have a more recent version autosaved at ",
            Date(last_autosaved).toLocaleString(),
            '. <a href="#revert-to-autosaved">Revert to that</a> or ',
            ' <a href="#ignore-autosaved">continue with this version</a>? ',
            ' <a href="#delete-autosave">[discard autosave]</a>'
        ].join('');
        var $alert = $('<li id="autosave-message" class="warning"/>').hide().html(msg);

        // 'grp-' prefix to support both Admin and Grapelli 2.4
        var $messagelist = $('.messagelist, .grp-messagelist');
        var $container = $('#content, #content-inner');
        if (!$messagelist.length) {
            // Put messagelist in place if it's not already there
            $messagelist = $('<ul class="messagelist grp-messagelist"/>').prependTo($container);
        }
        $messagelist.append($alert);
        $alert.fadeIn();
    };

    DjangoAutosave.captureForm = function() {
        var $form = $('form');
        var $fields = $form.find(':input:not([name="csrfmiddlewaretoken"])');
        var field_list = [];
        var $field, name;
        for (var i = $fields.length - 1; i >= 0; i--) {
            $field = $fields.eq(i);
            name = $field.attr('name');
            if (name) {
                field_list.push({ 'name': name, 'value': $field.val() });
            }
        }
        return field_list;
    };

    DjangoAutosave.save = function() {
        var existingData = DjangoAutosave.retrieve();
        var data = {
            formValues: DjangoAutosave.captureForm(),
            timestamp: Math.round((new Date()).getTime()/1000, 0),
            saveCount: (DjangoAutosave.saveCount || existingData.saveCount)
        };
        localStorage.setItem("autosaved_form:" + location.pathname, JSON.stringify(data));
        setTimeout(DjangoAutosave.save, 5000);
    };

    DjangoAutosave.retrieve = function() {
        // Get what's in storage
        var storageItem = localStorage.getItem("autosaved_form:" + location.pathname) || '{}';
        var data = $.parseJSON(storageItem);
        if (typeof DjangoAutosave.saveCount === 'undefined') {
            if (typeof data.saveCount === 'undefined') {
                DjangoAutosave.saveCount = data.saveCount = 0;
            } else {
                DjangoAutosave.saveCount = data.saveCount + 1;
            }
        }
        data.formValues = data.formValues || {};
        return data;
    };

    DjangoAutosave.clear = function() {
        localStorage.removeItem("autosaved_form:" + location.pathname);
    };

})(django.jQuery); // Must use Django jQuery because Django-CKEditor modifies it.
