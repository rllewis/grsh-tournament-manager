document.addEventListener( 'DOMContentLoaded', function () {
    var btn = document.getElementById( 'grsh-sync-run' );
    var out = document.getElementById( 'grsh-sync-output' );
    if ( ! btn || ! out ) {
        return;
    }
    btn.addEventListener( 'click', function () {
        out.textContent = 'Running...';
        fetch( grshCaptainSyncConfig.url, {
            method: 'POST',
            headers: { 'X-WP-Nonce': grshCaptainSyncConfig.nonce }
        } )
            .then( function ( r ) { return r.json(); } )
            .then( function ( data ) { out.textContent = JSON.stringify( data, null, 2 ); } )
            .catch( function ( err ) { out.textContent = 'Error: ' + err; } );
    } );
} );
