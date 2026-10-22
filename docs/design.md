# Approved design

The owner selected warm ivory, sage and forest green from Quiet Library, with
search-first grouped file results inspired by Open Index. Responsive web UI,
not a native phone simulator. Match snippets highlight keywords in pale ochre,
visually distinct from sage navigation selection.

Desktop: 232px fixed paper sidebar; fluid content with 48–64px margins and a
maximum width of 1130px. Search title in Newsreader; Inter for controls and
snippets. Search field 56px high. Flat result rows separated by thin rules.
Each row shows path, update date, serif title, match count and two passages.
Expansion shows further passages; opening a note keeps query highlights.

Mobile: 64px header, 20px content padding, 44px minimum controls, compact area
and sort selectors, two-item bottom navigation with safe-area spacing. Sidebar
becomes a dismissible drawer. Reader uses the full available width with 16px
body text; code and tables scroll internally. Keyboard focus is visible,
reduced-motion is respected, and dialogs trap focus and restore it on close.

Colors: background #f7f5ef; sidebar #efeee7; ink #272b29; muted #606762;
green #31594a; sage #e4eadb; highlight #f0e2ab; divider #dddcd3.
Fonts are self-hosted. Phosphor icons supply the open-book mark and UI icons.

Search states: initial/browse, pending, results, no matches, error and retry.
Reader: back to results (restoring query, filters and scroll), contents,
matched-term navigation, source/wiki links and backlinks. Account: sign in,
password reveal, change password and sign out. Content stays read-only.
