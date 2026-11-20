# Licenses and Credits

## Fonts
- **Fraunces Black** (latin subset, `public/fonts/fraunces-black-latin.woff2`), used for the splash title and the result ribbon (D51). Copyright 2020 The Fraunces Project Authors (github.com/undercasetype/Fraunces). SIL Open Font License 1.1; the full licence is in `public/fonts/OFL.txt`. Taken from the @fontsource/fraunces package (version 5.3.0); the package is not a dependency of the project.

- **Nunito** 700 and 800 (latin subset, `public/fonts/nunito-700-latin.woff2`, `nunito-800-latin.woff2`), the words on the leaderboard screens (D62). Copyright 2014 The Nunito Project Authors (github.com/googlefonts/nunito). SIL Open Font License 1.1; the licence is in `public/fonts/OFL-Nunito.txt`. Taken from the @fontsource/nunito package (version 5.3.0) and subset with fontTools by `scripts/build-fonts.py`; the package is not a dependency of the project.
- **Checkervia Numerals** (`public/fonts/checkervia-numerals.woff2`), the counts and ranks on the leaderboard screens (D62): a modified version of Fraunces Black (the variable font from github.com/google/fonts, ofl/fraunces, instanced at weight 900) holding only the digits, # and %, with the digits given equal widths so numbers line up. Renamed because it is modified. Copyright 2020 The Fraunces Project Authors, SIL Open Font License 1.1 (`public/fonts/OFL.txt`). Made by `scripts/build-fonts.py`.

## Art
- The logo, the pieces (`public/art`), the ribbon and the icons are drawn in SVG for this project, after the owner's mockups in `mockup/`.
- **Avatars** (`public/avatars/a01.svg` to `a40.svg`, D62): 40 portraits drawn for this project from simple shapes by `scripts/make-avatars.mjs`. Our own work, not copied from any game or brand; free to use under the project's own terms (CC0 if ever shared on their own).
- **Leaderboard icons** (`src/ui/leaderboard/lbIcons.tsx`: crowns, laurels, trophy, medals, stat card symbols) drawn in SVG for this project after the owner's mockups.
- **Country flags** on the leaderboard (D57): the `flag-icons` package, version 7.6.0, by Panayiotis Lipiridis and contributors, MIT License (the licence travels with the package in `node_modules/flag-icons/LICENSE`). The 4 by 3 SVG files are copied into the build as they are, one file per flag.
- **Online play icons** (`src/ui/online/onlineIcons.tsx` and the door in `src/ui/online/LeaveRoom.tsx`: globe, plus, key, copy, share, tick, leave; D142): drawn in SVG for this project in the line style of the home menu. No outside source.
