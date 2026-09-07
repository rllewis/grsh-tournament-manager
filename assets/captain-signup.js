/**
 * GRSH Captain Signup — public "Register My Team" form.
 * Vanilla JS, no build step — mirrors the admin invite tool's pattern.
 * Renders into #grsh-captain-signup-root (see class-grsh-captain-signup.php).
 */
document.addEventListener( 'DOMContentLoaded', function () {
    var root = document.getElementById( 'grsh-captain-signup-root' );
    if ( ! root || typeof grshCaptainSignupConfig === 'undefined' ) {
        return;
    }

    var divisionOptions = ( grshCaptainSignupConfig.divisions || [] )
        .map( function ( d ) { return '<option value="' + d.key + '">' + d.label + '</option>'; } )
        .join( '' );

    root.innerHTML =
        '<form id="grsh-signup-form" class="grsh-signup-form">' +
            '<p><label>Your name<br><input type="text" id="grsh-signup-name" required></label></p>' +
            '<p><label>Your email<br><input type="email" id="grsh-signup-email" required></label></p>' +
            '<p><label>Team name<br><input type="text" id="grsh-signup-team-name" required></label></p>' +
            '<p><label>Division<br><select id="grsh-signup-division" required>' +
                '<option value="">Choose a division</option>' + divisionOptions +
            '</select></label></p>' +
            // Honeypot — hidden from real visitors via CSS, catches bots
            // that fill in every field they find.
            '<p style="position:absolute;left:-9999px;" aria-hidden="true">' +
                '<label>Website<input type="text" id="grsh-signup-website" tabindex="-1" autocomplete="off"></label>' +
            '</p>' +
            '<p><button type="submit" id="grsh-signup-submit">Register My Team</button></p>' +
        '</form>' +
        '<div id="grsh-signup-output"></div>';

    var form   = document.getElementById( 'grsh-signup-form' );
    var out    = document.getElementById( 'grsh-signup-output' );
    var submit = document.getElementById( 'grsh-signup-submit' );

    form.addEventListener( 'submit', function ( e ) {
        e.preventDefault();
        submit.disabled = true;
        out.textContent = 'Submitting...';

        fetch( grshCaptainSignupConfig.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-GRSH-Nonce': grshCaptainSignupConfig.nonce
            },
            body: JSON.stringify( {
                name: document.getElementById( 'grsh-signup-name' ).value,
                email: document.getElementById( 'grsh-signup-email' ).value,
                team_name: document.getElementById( 'grsh-signup-team-name' ).value,
                division: document.getElementById( 'grsh-signup-division' ).value,
                website: document.getElementById( 'grsh-signup-website' ).value,
                // Server compares this to its own clock to reject
                // fill-in-under-N-seconds bot submissions.
                rendered_at: grshCaptainSignupConfig.renderedAt
            } )
        } )
            .then( function ( r ) { return r.json().then( function ( data ) { return { ok: r.ok, data: data }; } ); } )
            .then( function ( result ) {
                if ( ! result.ok ) {
                    submit.disabled = false;
                    out.textContent = 'Error: ' + ( result.data.error || 'Could not register your team.' );
                    return;
                }
                form.style.display = 'none';
                out.innerHTML = '<p><strong>Check your email.</strong> We sent you a link to set your ' +
                    'password and log in. Once you log in you can build your roster.</p>';
            } )
            .catch( function ( err ) {
                submit.disabled = false;
                out.textContent = 'Error: ' + err;
            } );
    } );
} );
