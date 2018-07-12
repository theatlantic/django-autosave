var DjangoAutosave = (window.DjangoAutosave) ? DjangoAutosave : {};

(function($) {

    // From http://www.quirksmode.org/js/cookies.html
    function createCookie(name,value,days,path) {
        if (days) {
            var date = new Date();
            date.setTime(date.getTime()+(days*24*60*60*1000));
            var expires = "; expires="+date.toGMTString();
        }
        else var expires = "";
        if (!path) { path = "/"; }
        document.cookie = name+"="+value+expires+"; path=" + path;
    }

    function readCookie(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for(var i=0;i < ca.length;i++) {
            var c = ca[i];
            while (c.charAt(0)==' ') c = c.substring(1,c.length);
            if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
        }
        return null;
    }

    function eraseCookie(name) {
        createCookie(name,"",-1);
    }

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

    $(document).on('click', '.ignore-autosaved', function(e) {
        // Clicking this should remove the banner and start autosaving again, replacing
        // the old version.
        e.preventDefault();
        $(e.target).closest('li').fadeOut('fast');
        DjangoAutosave.save();
        setTimeout(DjangoAutosave.save, 5000);
    });

    $(document).on('click', '.delete-autosave', function(e) {
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
    $(document).on('click', '.revert-to-autosaved', function(e) {
        e.preventDefault();

        // Generate new form data
        var $form = $('form');
        var data = DjangoAutosave.retrieve();

        // Disable the existing form
        $form.find(':input:not([name="csrfmiddlewaretoken"])').remove();

        $.each(data.formValues, function(i, attributes) {
            if ($.isArray(attributes.value)) {
                var $select = $('<select multiple="multiple"></select>').attr({name: attributes.name});
                $.each(attributes.value, function(i, value) {
                    $('<option selected="selected"></option>').val(value).appendTo($select);
                });
                $select.appendTo($form);
            } else {
                $('<input type="hidden" />').attr(attributes).appendTo($form);
            }
        });

        // The CSRF token can change and cause 403's. Always use the current one.
        if (DjangoAutosave.csrf_token) {
            $(':input[name="csrfmiddlewaretoken"]').val(DjangoAutosave.csrf_token);
        }

        // This adds an element to the page that tells Django forms
        // to deliberately fail validation, and return the autosaved contents.
        $form.append($('<input type="hidden" name="is_retrieved_from_autosave" value="1"/>'));
        $form.data('isRevert', true);
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

        DjangoAutosave.prune();
        DjangoAutosave.csrf_token = $('[name="csrfmiddlewaretoken"]').val();

        // If "autosave_success" cookie is falsey, set value to 0 and expire in
        // 24 hours.
        if(readCookie("autosave_success") !== "1") {
            createCookie("autosave_success", 0, 1, location.pathname);
        } else if (readCookie("autosave_success") === "1"){
            // If "autosave_success" has been modified by the server, clear the
            // autosave.
            DjangoAutosave.clear();
            eraseCookie("autosave_success");
        }

        var data = DjangoAutosave.retrieve();
        var config = DjangoAutosave.config;
        var last_updated;

        if (config.last_updated_epoch === null && !config.is_add_view) {
            // No date means this object doesn't exist yet.
            return false;
        }
        if (config.last_updated_epoch === null) {
            if (!config.is_add_view) {
                // This indicates an error of some sort. Abort.
                return false;
            } else {
                // The user has never saved an object for this model.
                last_updated = 0;
            }
        } else {
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
        var $textareas = $(".django-ckeditor-textarea:not([id*='__prefix__'])");

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
            '. <a href="#revert-to-autosaved" class="revert-to-autosaved">Revert to that</a> or ',
            ' <a href="#ignore-autosaved" class="ignore-autosaved">continue with this version</a>?'
        ].join('');
        var $alert = $('<li id="autosave-message" class="info"/>').hide().html(msg);

        // 'grp-' prefix to support both Admin and Grapelli 2.4
        var $messagelist = $('.messagelist, .grp-messagelist');
        var $container = $('#content, #content-inner, #grp-content');
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
                if ($field.prop('checked') === false && $field.attr('type') == 'checkbox') {
                    continue;
                }
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

    DjangoAutosave.prune = function(timeout) {
        if (timeout === undefined) { timeout = 60 * 60 * 24 * 5; }
        oldest_timestamp = Math.floor((new Date()).getTime() / 1000) - timeout;

        for (var key in localStorage) {
            if (key.match(/^autosaved_form/)) {
                var autosave = JSON.parse(localStorage.getItem(key));

                if (autosave.timestamp < oldest_timestamp) {
                    localStorage.removeItem(key);
                }
            }
        }
    };

})(django.jQuery); // Must use Django jQuery because Django-CKEditor modifies it.
