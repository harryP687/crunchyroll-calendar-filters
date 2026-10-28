# Crunchyroll Calendar Filters

A Firefox/FireMonkey userscript for Crunchyroll’s [Release Calendar](https://www.crunchyroll.com/releasecalendar).

## Features

- **Hide dubs:** keep releases containing Japanese audio.
- **Watchlist only:** show releases from your current profile’s watchlist.
- **Always show premieres:** let premieres bypass the watchlist filter. Hide dubs still applies.
- Hidden-release counts below each date; settings are remembered.

## Install

1. Install [FireMonkey for Firefox](https://addons.mozilla.org/en-US/firefox/addon/firemonkey/).
2. Open the **[userscript](https://raw.githubusercontent.com/harryP687/crunchyroll-calendar-filters/main/crunchyroll-release-calendar-filters.user.js)** and confirm installation.
3. Reload the [calendar](https://www.crunchyroll.com/releasecalendar).

If no install prompt appears, copy the script into a new FireMonkey userscript, save, and enable it.

## Notes

- Sign in for watchlist filtering. The premiere option appears when Watchlist only is enabled.
- Works on `/releasecalendar`, including `?date=…`. Reload if arriving through Crunchyroll’s menus.
- Disable the script in FireMonkey and reload to remove it.
