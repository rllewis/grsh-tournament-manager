document.addEventListener( 'DOMContentLoaded', function () {
    var queue = [];
    var form = document.getElementById( 'grsh-matchup-form' );
    var addBtn = document.getElementById( 'grsh-add-matchup' );
    var listEl = document.getElementById( 'grsh-matchup-list' );
    var hiddenInput = document.getElementById( 'grsh-matchups-json' );
    var generateBtn = document.getElementById( 'grsh-generate-btn' );
    var countEl = document.getElementById( 'grsh-queue-count' );
    if ( ! form || ! addBtn ) return;

    function render() {
        listEl.innerHTML = '';
        queue.forEach( function ( m, i ) {
            var li = document.createElement( 'li' );
            li.style.padding = '6px 0';
            li.style.borderBottom = '1px solid #eee';
            li.textContent = m.home_name + ' vs ' + m.away_name + ' - ' + m.date + ' ' + m.game_time + ' @ ' + m.arena;
            var rm = document.createElement( 'button' );
            rm.type = 'button';
            rm.textContent = 'Remove';
            rm.className = 'button';
            rm.style.marginLeft = '10px';
            rm.addEventListener( 'click', function () {
                queue.splice( i, 1 );
                render();
            } );
            li.appendChild( rm );
            listEl.appendChild( li );
        } );
        countEl.textContent = queue.length;
        generateBtn.disabled = queue.length === 0;
    }

    addBtn.addEventListener( 'click', function () {
        var homeSel = document.getElementById( 'grsh-home-team' );
        var awaySel = document.getElementById( 'grsh-away-team' );
        var homeId = homeSel.value;
        var awayId = awaySel.value;
        if ( ! homeId || ! awayId ) { alert( 'Choose both a home and away team.' ); return; }
        // '0' is the Blank/TBD option — allow Blank vs Blank (a fully
        // hand-written sheet), only block two identical REAL teams.
        if ( homeId === awayId && homeId !== '0' ) { alert( 'Home and away team must be different.' ); return; }
        var typeInput = document.querySelector( 'input[name="grsh-type"]:checked' );
        queue.push( {
            home_id: homeId,
            away_id: awayId,
            home_name: homeSel.options[ homeSel.selectedIndex ].text,
            away_name: awaySel.options[ awaySel.selectedIndex ].text,
            date: document.getElementById( 'grsh-date' ).value,
            game_time: document.getElementById( 'grsh-time' ).value,
            arena: document.getElementById( 'grsh-arena' ).value,
            game_no: document.getElementById( 'grsh-game-no' ).value,
            type: typeInput ? typeInput.value : 'REG'
        } );
        render();
    } );

    form.addEventListener( 'submit', function () {
        hiddenInput.value = JSON.stringify( queue );
    } );

    render();
} );
