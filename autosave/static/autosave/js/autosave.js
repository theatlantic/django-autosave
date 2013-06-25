(function($) {

    window.Autosave = {};

    $(document).on('ready', function() {
        Autosave.setUp(); 
    });

    $(document).on('click', '[href=#ignore-autosaved]', function(e) {
        // Clicking this should remove the banner and start autosaving again, replacing
        // the old version.
        var $btn = $(e.target);
        var $note = $btn.closest('li');
        $note.fadeOut('fast');
        window.setInterval(Autosave.save, 5000);
    });

    $(document).on('click', '[href=#revert-to-autosaved]', function(e) {
        // Regenerates the form to submit old data, and posts it.
        
        // Handle banner
        var $btn = $(e.target);
        var $banner = $btn.closest('p');
        $banner.text("Reverting to your saved version. Be right back...");
        
        // Generate new form data
        var form = $('form');
        form.find('input', 'textarea', '[name]').prop('disabled',true); // Clear the existing form
        var data = JSON.parse(Autosave.retrieve()[0]);
        
        $.each(data, function(i, obj) {
            var input = $('<input type="hidden" />')[0];
            input.name = obj.name;
            input.value = obj.value;
            $('form').append(input);
        });

        // The CSRF token can change and cause 403's. Always use the current one.
        document.getElementsByName('csrfmiddlewaretoken')[0].value = Autosave.csrf_token;

        function addAutoSaveRetrieveField() {
            // This adds an element to the page that tells Django forms
            // to deliberately fail validation, and return the autosaved contents.
            var input = $('<input type="hidden" name="is_retrieved_from_autosave" value="1" />');
            $('form').append(input);
        }
        addAutoSaveRetrieveField();
        form.submit();

    });


    Autosave.setUp = function() {
        
        function pageIsChangeListView(){
            return $('#changelist-form').length == 1;
        }
        if (window.localStorage === undefined || pageIsChangeListView()) {
            // Requires local storage.
            return false;
        }

        Autosave.csrf_token = document.getElementsByName('csrfmiddlewaretoken')[0].value;
        Autosave.timestamp = $.get('last-modified/', function(data) { // Get the last updated value from the server
            if (data.last_updated_epoch === null){
                return false; // No date means this object doesn't exist yet.
            }
            var last_updated = parseInt(data.last_updated_epoch, 0) + 15; // An arbitrary margin of error to deal with clock sync
            var last_autosaved = parseInt(Autosave.retrieve()[1], 0);

            // If last_updated is more recent, than this story was probably edited by someone else/another device.
            // If the content is not different, the user probably just closed a window or went to get coffee and close a tab,
            // but had already saved their work.
            if ( last_autosaved > last_updated && Autosave.contentIsDifferent() ) {
                // Suggest revert
                Autosave.suggestRevert(last_autosaved);
            } else {
                // Start Saving Again
                window.setInterval(Autosave.save, 5000);
            }
        });
    };


    Autosave.contentIsDifferent = function() {
        // Determines if the autosaved data is different than the current version.

        var saved = Autosave.retrieve()[0];
        var current = Autosave.captureForm();

        // Parse and compare each field
        saved = JSON.parse(saved);
        current = JSON.parse(current);
        
        // If they're not even the same length, they're different.       
        if (saved.length !== current.length) {
            return true;
        }
        for (var i = saved.length - 1; i >= 0; i--) {
            if(saved[i].value !== current[i].value && saved[i].name !== 'csrfmiddlewaretoken' ){
                return true; // The values for non-ignored fields should be identical
            }
        }
        return false;
    };

    function now() {
        // This is slightly ridiculous because javascript's epoch time is
        // in milliseconds by default. We need seconds.
        return Math.round((new Date).getTime()/1000,0);
    }

    Autosave.suggestRevert = function(last_autosaved) {
        var msg = [
            "It looks like you have a more recent version autosaved at ",
            Date(last_autosaved).toLocaleString(),
            ". <a href='#revert-to-autosaved'>Revert to that</a> or",
            " <a href='#ignore-autosaved'>continue with this version</a>?"
        ].join('');
        var $alert = $('<li />');
        $alert.addClass('info');
        $alert.hide();
        $alert.html(msg);

        var $messagelist = $('.messagelist');
        var $container = $('#content, #content-inner'); // Support both Admin and Grapelli
        if ($messagelist.length === 0) { 
            // Put messagelist in place if it's not already there
            $messagelist = $('<ul />');
            $messagelist.addClass('messagelist grp-messagelist');
            $container.prepend($messagelist);
        }

        $messagelist.append($alert);
        $alert.fadeIn();
    };

    Autosave.getFormName = function() {
        // Key names are unique to the page/uri
        return "autosaved_form.data:" + window.location.pathname;
    };
    Autosave.getTimeStampName = function() {
        // Key names are unique to the page/uri
        return "autosaved_form.timestamp:" + window.location.pathname;
    };
    
    Autosave.captureForm = function() {

        var form = $('form');
        var fields = $('form').find('textarea, [name][value]'); // Textareas don't have a value attr, need to be special
        field_list = [];
        var field;
        for (var i = fields.length - 1; i >= 0; i--) {
            field = fields[i];
            field_list.push({ 'name': field.name, 'value': $(field).val() });
            // Val has to come from JQuery because CKeditor hooks it's update function in there.
        }
        return JSON.stringify(field_list);
    };

    Autosave.save = function() {
        var data = Autosave.captureForm();
        localStorage.setItem(Autosave.getFormName(), data);
        localStorage.setItem(Autosave.getTimeStampName(), now());
    };

    Autosave.retrieve = function() {
        // Get what's in storage
        var data = localStorage.getItem(Autosave.getFormName());
        var timestamp = localStorage.getItem(Autosave.getTimeStampName());
        return [data, timestamp];
    };

})(django.jQuery); // Must use Django jQuery because Django-CKEditor modifies it.
