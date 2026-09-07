/**
 * GRSH Captain Invite — vanilla JS for the admin "Invite a Captain" page.
 * Mirrors the existing captain-sync-admin.js pattern: no build step,
 * loaded directly, config passed in via wp_localize_script.
 */
document.addEventListener( 'DOMContentLoaded', function () {
    var form      = document.getElementById( 'grsh-invite-captain-form' );
    var out       = document.getElementById( 'grsh-invite-output' );
    var precheck  = document.getElementById( 'grsh-invite-precheck' );
    var division  = document.getElementById( 'grsh-invite-division' );
    var submit    = document.getElementById( 'grsh-invite-submit' );
    var cooldownEl = document.getElementById( 'grsh-invite-cooldown' );
    var emailInput = document.getElementById( 'grsh-invite-email' );
    if ( ! form || ! out || ! division || ! submit || ! emailInput ) {
        return;
    }

    var divisions = ( window.grshCaptainInviteConfig && grshCaptainInviteConfig.divisions ) || [];
    divisions.forEach( function ( d ) {
        var opt = document.createElement( 'option' );
        opt.value = d.key;
        opt.textContent = d.label;
        division.appendChild( opt );
    } );

    /**
     * Renders a WP-native notice box (matches core's .notice pattern —
     * see wp-admin/css/common.css) instead of plain text, so this reads
     * consistently with the rest of wp-admin. `type` is 'error',
     * 'warning', or 'success'. Added 2026-09-01.
     */
    function renderNotice( el, type, html ) {
        if ( ! html ) {
            el.className = '';
            el.innerHTML = '';
            return;
        }
        // Styled directly on the container itself (not a nested div) —
        // avoids duplicating its id and keeps the "don't hide this one"
        // CSS selector above matching correctly by id.
        el.className = 'notice notice-' + type;
        el.style.margin = '8px 0';
        el.style.padding = '8px 12px';
        el.innerHTML = html;
    }

    function existingTeamHtml( existingTeam ) {
        var base = 'This captain already has a team this season.';
        if ( ! existingTeam || ! grshCaptainInviteConfig.fullTeamsUrl ) {
            return base;
        }
        return base + ' <strong>' + existingTeam.name + '</strong> ('
            + existingTeam.division + '). <a href="' + grshCaptainInviteConfig.fullTeamsUrl
            + '" target="_blank" rel="noopener">View Full Team Rosters &rarr;</a>';
    }

    /**
     * Renders the "did you mean" fuzzy-match warning from
     * GRSH_Captain_Provision::check_existing_team()'s possible_matches —
     * a different name/email than an existing captain, but close enough
     * (>=82% similar, or an exact name match) that it's worth a second
     * look before sending a brand-new invite. Advisory only — never
     * blocks the form. Added 2026-09-01 (Round 2).
     */
    function possibleMatchesHtml( matches ) {
        if ( ! matches || ! matches.length ) {
            return '';
        }
        var items = matches.map( function ( m ) {
            return '<li>' + m.name + ' — ' + m.email + ', team "' + m.team + '" (' + m.division + ')</li>';
        } ).join( '' );
        return 'This looks similar to an existing captain — double check before sending a new invite:<ul style="margin:4px 0 0 18px;">'
            + items + '</ul>';
    }

    /**
     * Plain-English translation for REST error payloads, expanded in
     * Round 2 beyond the original single nonce special-case. Falls back
     * to the raw message/error string when nothing here matches, so an
     * unanticipated error is still shown rather than swallowed.
     */
    var ERROR_MESSAGE_MAP = {
        'rest_cookie_invalid_nonce': 'Your admin session timed out — reload this page and try again.',
        'rest_forbidden': 'You do not have permission to invite captains.',
        'invalid_email': 'That email address does not look valid.'
    };
    function translateError( data ) {
        if ( data && data.code && ERROR_MESSAGE_MAP[ data.code ] ) {
            return ERROR_MESSAGE_MAP[ data.code ];
        }
        return null;
    }

    // --- Pre-submit duplicate check -----------------------------------
    // Debounced lookup on the email field, added 2026-09-01: turns the
    // old dead-end "already has a team" error (which you only saw after
    // filling out the whole form) into an early warning, before staff
    // have typed a team name or picked a division.
    var precheckTimer = null;
    var nameInput = document.getElementById( 'grsh-invite-name' );
    if ( precheck && grshCaptainInviteConfig.checkUrl ) {
        var runPrecheck = function () {
            var email = emailInput.value.trim();
            var name  = nameInput ? nameInput.value.trim() : '';
            window.clearTimeout( precheckTimer );
            renderNotice( precheck, 'warning', '' );
            // Still worth checking on name alone (fuzzy match) even with
            // no email yet — only skip when there's nothing to check at all.
            if ( ( ! email || email.indexOf( '@' ) === -1 ) && name.length < 3 ) {
                return;
            }
            precheckTimer = window.setTimeout( function () {
                var qs = 'email=' + encodeURIComponent( email ) + '&name=' + encodeURIComponent( name );
                fetch( grshCaptainInviteConfig.checkUrl + '?' + qs, {
                    headers: { 'X-WP-Nonce': grshCaptainInviteConfig.nonce }
                } )
                    .then( function ( r ) { return r.ok ? r.json() : null; } )
                    .then( function ( data ) {
                        // Bail if either field changed while this was in flight.
                        if ( ! data || emailInput.value.trim() !== email || ( nameInput && nameInput.value.trim() !== name ) ) {
                            return;
                        }
                        if ( data.exists ) {
                            renderNotice( precheck, 'warning', existingTeamHtml( data.existing_team ) );
                        } else if ( data.possible_matches && data.possible_matches.length ) {
                            renderNotice( precheck, 'warning', possibleMatchesHtml( data.possible_matches ) );
                        } else {
                            renderNotice( precheck, 'warning', '' );
                        }
                    } )
                    .catch( function () { /* silent — this is a convenience check, not a blocker */ } );
            }, 400 );
        };
        emailInput.addEventListener( 'input', runPrecheck );
        if ( nameInput ) {
            nameInput.addEventListener( 'input', runPrecheck );
        }
    }

    // --- Resend cooldown -------------------------------------------------
    // After a successful send, briefly disable the button so a double
    // click (or an impatient re-click while the email is in flight)
    // can't fire a second real invite email to the same captain. This is
    // a UI nudge, not a hard security gate — matches the staff doc's own
    // "don't resend more than once or twice" guidance. Added 2026-09-01.
    function startCooldown( seconds ) {
        if ( ! cooldownEl ) {
            return;
        }
        submit.disabled = true;
        var remaining = seconds;
        cooldownEl.textContent = ' Wait ' + remaining + 's before sending another invite.';
        var interval = window.setInterval( function () {
            remaining -= 1;
            if ( remaining <= 0 ) {
                window.clearInterval( interval );
                submit.disabled = false;
                cooldownEl.textContent = '';
                return;
            }
            cooldownEl.textContent = ' Wait ' + remaining + 's before sending another invite.';
        }, 1000 );
    }

    /**
     * Actually POSTs the invite. Split out from the submit handler so the
     * 10-second Undo window below can delay this instead of firing it
     * immediately on click. Added 2026-09-01 (Round 2).
     */
    function sendInvite( payload ) {
        renderNotice( out, 'warning', 'Sending invite&hellip;' );

        fetch( grshCaptainInviteConfig.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': grshCaptainInviteConfig.nonce
            },
            body: JSON.stringify( payload )
        } )
            .then( function ( r ) { return r.json().then( function ( data ) { return { ok: r.ok, data: data }; } ); } )
            .then( function ( result ) {
                submit.disabled = false;
                if ( ! result.ok ) {
                    // Prefer a plain-English mapped message; then our own
                    // error string; then WordPress's own `message` field
                    // (e.g. "Cookie check failed" on a stale/invalid REST
                    // nonce) before the generic text, so a nonce failure
                    // is diagnosable instead of silent.
                    var msg = translateError( result.data ) || result.data.error || result.data.message || 'Could not invite captain.';
                    if ( result.data.existing_team !== undefined && result.data.error ) {
                        msg = existingTeamHtml( result.data.existing_team );
                    }
                    renderNotice( out, 'error', 'Error: ' + msg );
                    return;
                }
                var created = result.data.created_user
                    ? 'A new account was created and they were emailed a link to set their password.'
                    : 'This email already had an account — it now has captain access.';
                renderNotice( out, 'success', 'Invited. Team "' + result.data.name + '" created. ' + created
                    + ' Roster page: <a href="' + grshCaptainInviteConfig.rosterUrl + '" target="_blank" rel="noopener">'
                    + grshCaptainInviteConfig.rosterUrl + '</a>' );
                renderNotice( precheck, 'warning', '' );

                // Optimistic UI: append a row to the server-rendered
                // "Invites this season" table below instead of requiring
                // a full page reload to see the new invite reflected.
                // Added 2026-09-01 (Round 2).
                appendSummaryRow( payload, result.data );

                form.reset();
                startCooldown( 8 );
            } )
            .catch( function ( err ) {
                submit.disabled = false;
                renderNotice( out, 'error', 'Error: ' + err );
            } );
    }

    /**
     * "M. Ortiz" -> "MO", "Cher" -> "CH" — mirrors the PHP
     * GRSH_Captain_Invite::initials() helper used for the server-rendered
     * rows, so an optimistic row's avatar badge matches on reload.
     * Added 2026-09-02 (visual pass).
     */
    function initialsFor( name ) {
        var parts = ( name || '' ).trim().split( /\s+/ ).filter( Boolean );
        if ( ! parts.length ) {
            return '—';
        }
        if ( parts.length === 1 ) {
            return parts[0].slice( 0, 2 ).toUpperCase();
        }
        return ( parts[0].charAt( 0 ) + parts[ parts.length - 1 ].charAt( 0 ) ).toUpperCase();
    }

    /**
     * Adds one row to the #grsh-invite-summary-table body so the invite
     * that was just sent shows up immediately, without a reload. Mirrors
     * the server-rendered row shape in class-grsh-captain-invite.php's
     * render_admin_page() — 5 columns (Captain, Team/Division, Status,
     * Roster, Actions), avatar badge + status pill + roster mini-bar,
     * restyled 2026-09-02. A row that was just created this second is
     * always "Invited" / 0 roster / no nudge yet, so those are hardcoded
     * here rather than recomputed.
     */
    function appendSummaryRow( payload, resultData ) {
        var table = document.getElementById( 'grsh-invite-summary-table' );
        var tbody = table && table.querySelector( 'tbody' );
        if ( ! tbody ) {
            return;
        }
        var emptyRow = tbody.querySelector( 'td[colspan]' );
        if ( emptyRow ) {
            emptyRow.parentElement.remove();
        }
        var teamId     = resultData.id || 0;
        var minPlayers = resultData.min_players || 11;
        var tr = document.createElement( 'tr' );
        tr.setAttribute( 'data-team-id', teamId );

        var captainTd = document.createElement( 'td' );
        captainTd.innerHTML = '<div class="grsh-captain-cell">'
            + '<div class="grsh-avatar" style="background:var(--grsh-inv);">' + initialsFor( payload.name ) + '</div>'
            + '<div><span class="grsh-cap-name"></span><span class="grsh-cap-email"></span></div>'
            + '</div>';
        captainTd.querySelector( '.grsh-cap-name' ).textContent = payload.name;
        captainTd.querySelector( '.grsh-cap-email' ).textContent = payload.email;
        tr.appendChild( captainTd );

        var teamTd = document.createElement( 'td' );
        teamTd.textContent = ( resultData.name || payload.team_name ) + ' — ' + ( resultData.division || payload.division );
        tr.appendChild( teamTd );

        var statusTd = document.createElement( 'td' );
        statusTd.innerHTML = '<span class="grsh-pill grsh-inv">Invited</span>';
        tr.appendChild( statusTd );

        var rosterTd = document.createElement( 'td' );
        rosterTd.innerHTML = '<div class="grsh-roster-mini">'
            + '<div class="grsh-heat-bar-track"><div class="grsh-heat-bar-fill" style="width:0%;background:var(--grsh-inv);"></div></div>'
            + '<span></span></div>';
        rosterTd.querySelector( 'span' ).textContent = '0/' + minPlayers;
        tr.appendChild( rosterTd );

        // Actions cell: a freshly-sent invite is always password-pending,
        // so the QR/Link action is always relevant here. No Welcome
        // Packet link yet — that goes through admin-post.php with a
        // server-rendered nonce, which this optimistic row doesn't have;
        // a page reload picks it up like any other row. Added 2026-09-01
        // (Round 3).
        var actionsTd = document.createElement( 'td' );
        actionsTd.innerHTML = '<div class="grsh-actions"></div>';
        if ( teamId ) {
            var qrLink = document.createElement( 'a' );
            qrLink.href = '#';
            qrLink.className = 'grsh-icon-btn grsh-qr-link';
            qrLink.title = 'QR / Link';
            qrLink.setAttribute( 'data-team-id', teamId );
            qrLink.setAttribute( 'data-name', payload.name );
            qrLink.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h.01"/></svg>'
                + '<span class="screen-reader-text">QR / Link</span>';
            actionsTd.querySelector( '.grsh-actions' ).appendChild( qrLink );
        }
        tr.appendChild( actionsTd );

        tbody.insertBefore( tr, tbody.firstChild );
    }

    // --- QR / reset-link popup --------------------------------------
    // Added 2026-09-01 (Round 3). Delegated on the table's parent so it
    // also catches the optimistic row appended above without rebinding.
    // Regenerates the captain's password-reset-key link on demand (same
    // mechanism WordPress core itself uses) and renders it as a QR code
    // via the vendored qrcode.js — nothing here ever calls a third-party
    // service with that link, since it's a live single-use credential.
    var qrOverlay  = document.getElementById( 'grsh-qr-overlay' );
    var qrTitle    = document.getElementById( 'grsh-qr-title' );
    var qrCanvas   = document.getElementById( 'grsh-qr-canvas' );
    var qrLinkText = document.getElementById( 'grsh-qr-link-text' );
    var qrClose    = document.getElementById( 'grsh-qr-close' );
    var summaryTable = document.getElementById( 'grsh-invite-summary-table' );

    function closeQrOverlay() {
        if ( qrOverlay ) {
            qrOverlay.style.display = 'none';
        }
    }

    if ( summaryTable && qrOverlay && window.qrcode && grshCaptainInviteConfig.resetLinkUrl ) {
        summaryTable.addEventListener( 'click', function ( e ) {
            var link = e.target.closest ? e.target.closest( '.grsh-qr-link' ) : null;
            if ( ! link ) {
                return;
            }
            e.preventDefault();
            var teamId = link.getAttribute( 'data-team-id' );
            var name   = link.getAttribute( 'data-name' ) || '';
            if ( ! teamId ) {
                return;
            }
            fetch( grshCaptainInviteConfig.resetLinkUrl + '?team_id=' + encodeURIComponent( teamId ), {
                headers: { 'X-WP-Nonce': grshCaptainInviteConfig.nonce }
            } )
                .then( function ( r ) { return r.json().then( function ( d ) { return { ok: r.ok, data: d }; } ); } )
                .then( function ( res ) {
                    if ( ! res.ok ) {
                        window.alert( res.data.error || 'Could not generate a code.' );
                        return;
                    }
                    if ( qrTitle ) {
                        qrTitle.textContent = name ? ( 'Sign-up code — ' + name ) : 'Sign-up code';
                    }
                    if ( qrLinkText ) {
                        qrLinkText.textContent = res.data.link;
                    }
                    if ( qrCanvas ) {
                        // 'M' error correction is the library's own
                        // recommended default for general use; -1 type
                        // number lets it auto-size to the URL length.
                        var qr = window.qrcode( -1, 'M' );
                        qr.addData( res.data.link );
                        qr.make();
                        var ctx = qrCanvas.getContext( '2d' );
                        var cellSize = 4;
                        var count = qr.getModuleCount();
                        qrCanvas.width = count * cellSize;
                        qrCanvas.height = count * cellSize;
                        qr.renderTo2dContext( ctx, cellSize );
                    }
                    if ( qrOverlay ) {
                        qrOverlay.style.display = 'flex';
                    }
                } )
                .catch( function () {
                    window.alert( 'Could not generate a code — check your connection and try again.' );
                } );
        } );
    }

    if ( qrClose ) {
        qrClose.addEventListener( 'click', closeQrOverlay );
    }
    if ( qrOverlay ) {
        qrOverlay.addEventListener( 'click', function ( e ) {
            if ( e.target === qrOverlay ) {
                closeQrOverlay();
            }
        } );
    }

    // --- 10-second Undo before sending -----------------------------------
    // One of the ten requested "wow" features: a real account and email
    // go out the moment this fires, so instead of sending instantly on
    // click, hold for 10s with a visible Undo link. Added 2026-09-01.
    var pendingSendTimer = null;
    form.addEventListener( 'submit', function () {
        if ( pendingSendTimer ) {
            return; // already counting down — ignore a double-submit
        }
        submit.disabled = true;

        var payload = {
            name: document.getElementById( 'grsh-invite-name' ).value,
            email: emailInput.value,
            team_name: document.getElementById( 'grsh-invite-team-name' ).value,
            division: division.value
        };

        var undoEl = document.getElementById( 'grsh-invite-undo' );
        var remaining = 10;

        // Fixed 2026-09-01: the original version called undoEl.innerHTML
        // on every one-second tick to update the countdown number. That
        // silently destroyed and recreated the <a id="grsh-invite-undo-
        // link"> element each time, but the click listener below was only
        // ever attached to the first, throwaway copy — so Undo went dead
        // after about one second even though the visible number kept
        // counting down normally for the full 10. Fix: render the markup
        // once, attach the listener once, and update only the countdown
        // <span>'s text on each tick from here on.
        function cancelPendingSend( message ) {
            window.clearInterval( pendingSendTimer );
            pendingSendTimer = null;
            submit.disabled = false;
            if ( undoEl ) {
                undoEl.innerHTML = '';
            }
            renderNotice( out, 'warning', message );
        }

        if ( undoEl ) {
            undoEl.innerHTML = 'Sending in <span id="grsh-invite-undo-count">' + remaining
                + '</span>s&hellip; <a href="#" id="grsh-invite-undo-link">Undo</a>';
            var undoLink = document.getElementById( 'grsh-invite-undo-link' );
            if ( undoLink ) {
                undoLink.addEventListener( 'click', function ( e ) {
                    e.preventDefault();
                    cancelPendingSend( 'Invite cancelled — nothing was sent.' );
                } );
            }
        }
        renderNotice( out, 'warning', 'Invite queued — you can undo for the next ' + remaining + ' seconds.' );

        pendingSendTimer = window.setInterval( function () {
            remaining -= 1;
            if ( remaining <= 0 ) {
                window.clearInterval( pendingSendTimer );
                pendingSendTimer = null;
                if ( undoEl ) {
                    undoEl.innerHTML = '';
                }
                sendInvite( payload );
                return;
            }
            var countEl = document.getElementById( 'grsh-invite-undo-count' );
            if ( countEl ) {
                countEl.textContent = remaining;
            }
        }, 1000 );
    } );
} );
