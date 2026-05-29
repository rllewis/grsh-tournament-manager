=== GRSH Tournament Manager ===
Contributors: techtribeconsulting
Tags: hockey, tournament, roster, draft
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.1
Stable tag: 1.1.0
License: Proprietary

Gold Rush Senior Hockey — Tournament Management Platform.

== Description ==

Player registration sync, roster management, snake draft, auto-balance,
historical tracking, and communications for the Gold Rush Senior Hockey
tournament.

Requires WPForms Pro for player registration sync.

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/`.
2. Ensure WPForms Pro is installed and active.
3. Activate the plugin via the Plugins menu.
4. Navigate to GRSH in the WordPress admin sidebar.

== Requirements ==

* WordPress 6.4 or higher
* PHP 8.1 or higher
* WPForms Pro (active)

== Changelog ==

= 1.1.0 =
* Fixed admin page routing — React PAGES map now matches registered WP admin slugs.
* Fixed admin menu capability — committee and readonly roles can now access GRSH pages.
* Added per-page capability control — Settings and Import History restricted to manage_options.
* Fixed CSS enqueue — no longer attempts to load grsh-admin.css when file does not exist.
* Fixed Settings save — now attempts real API call and reports error if backend is not connected.
* Fixed delete button opacity calculation in History Import (syntax bug causing state to never apply).
* Added delete confirmation dialog to History Import to prevent accidental record loss.
* Changed template download nonce to use _wpnonce param recognised by WP REST API.
* Added Tested up to header field.
* Added Update URI: false to suppress wordpress.org update checks for proprietary plugin.
* Removed unused npm dependencies (axios, zustand, react-dnd, react-dnd-html5-backend).

= 1.0.0 =
* Initial release.
