# Terms and notices (DRAFT)

> **Draft, not legal advice.** Written by the developer with an AI assistant for this hobby project. The owner should have it reviewed by someone qualified before relying on it. The app shows the same text (`src/ui/TermsDialog.tsx`); change both together.
>
> Notice version for the Strongest consent: 1 (`NOTICE_VERSION` in `src/ui/consent.ts`). Changing the Strongest notice text means bumping it, so everyone is asked again.
>
> The leaderboard is live. The draw update (D89) requires migration 5 before deployment. "Reported" (games played, losses and draws are not replay checked) is said here, not on the screens, as the owner asked.

## Entertainment only
- Checkervia is a free checkers game made for fun. Nothing in it is advice of any kind.

## AI generated text
- The AI's moves are checked by our game engine, but its words (its reasons and its lines about your play) are written by an AI language model reached through OpenRouter.
- Those words can be wrong, odd or unwelcome. We check them with word lists, but a filter cannot catch everything.

## Strong language at Strongest
- Easy, Medium and Hard are kept clean.
- At Strongest the AI may insult your play and use mild profanity after you make a mistake. It is part of the game and is not meant seriously.
- At every level, slurs, hate, sexual content, remarks about real world traits, family or identity, and threats are blocked.

## 18 plus: a self declaration
- Strongest is for adults. You confirm that you are 18 or older yourself; we cannot check it.
- We never ask for or store your age. If you are under 18, please play Easy, Medium or Hard.

## What is stored
- In your browser: your chosen level, your settings, your acceptance of the Strongest notice (the time and the notice version), your totals against the AI (games, wins, losses, draws and resignations), which the AI uses to tease you and, for the leaderboard, a random device id, your profile's secret key, any win that could not be sent yet (kept for at most 7 days) and the code of the online room you are in (so a reload takes you back to it). Clearing your browser data removes them.
- In this tab only: your wins and losses against the AI, so it can greet you. They are gone when you close the tab.
- During a game, the board and the list of possible moves are sent to the AI provider so the AI can choose its move. No personal details are sent.
- On our server: only what the sections below list. Your profile, your results and your online rooms are stored only once you choose a username.

## Leaderboard
- Before your first game against the AI you make a profile: a username, an avatar and a flag. Usernames are public and unique, and there is no tag. Please do not use your real name. Usernames are filtered, and names or entries that break these rules may be hidden or removed.
- Your username, avatar, flag and wins are public on the leaderboard.
- When you win a game against the AI, the win is submitted automatically after the result appears. Our server checks each one by replaying all of its moves. A win when the AI resigns counts only when the server proves the AI had a forced loss. Two player games, draws, games you resign and games the AI wins never count. If the win cannot be sent (for example while you are offline), it is kept in your browser for up to 7 days and sent by itself later.
- Your profile shows your games played, wins, losses, draws and win rate. Wins are checked by replay. Games played, losses and draws are reported by the game in your browser and are not checked by replay. The AI's record in the game adds up the reported games of every player: totals only, never names.
- If you leave a game against the AI without moving for a minute, the game is abandoned and the AI reports you. The fourth report suspends your account for 30 days: no games against the AI until then (two players and Learn stay open), and the count starts again. Our server stores each report (the game, its level, whether it came before your first move, and the time) and your suspension, and your browser keeps the same. Only you see your reports, in your own profile. Questions about a suspension: checkervia.games@gmail.com.
- Our server stores your username, your avatar (only which picture you chose), your flag, the level, moves and stats of each win, the results of your finished games against the AI (a win, a loss, a draw, or a loss by resignation), the date of your last username change, and the dates. It also stores scrambled (hashed) forms of a secret key and a random device id kept in your browser, and of your IP address. It never stores your raw IP address, your age or your email.
- The avatar groups (male, female, kid, older adult) only help you find a picture. Which group you looked at is never sent or stored.
- You choose your flag yourself, or Prefer not to show a flag. It is never guessed from your connection. You can change your flag and your avatar any time.
- You can change your username once every 7 days. Your old username stays reserved for you for 30 days, so nobody else can take it; after that it is free again. Your wins and stats stay with you.
- The scrambled device id and IP address are used only to limit how often requests can be made. They are never shown.
- Your profile belongs to the secret key kept in this browser. Clearing your browser data loses the profile, and its username stays taken.
- Anyone can view the leaderboard and the profiles on it, without choosing a username.
- To have a profile or an entry removed, email checkvia.games@gmail.com with the username and roughly when you submitted it.

## Online play with a friend
- Playing online with a friend needs a profile. Your friend sees your username, avatar and flag, and whether you are online or away. They see nothing else about you.
- Each room has a 6 character code. Anyone who has the code can take the free seat while the room waits, so share it only with your friend. A room holds two players, and nobody can watch.
- Our server checks every move with the game's rules, decides the colours (at random in the first game, swapped in each rematch), whose turn it is and when a game is drawn, with the same draw rules as every game. Online games never count on the leaderboard, in your profile's counts or in the AI's record.
- If you lose your connection or close the game during a game, your friend sees a 60 second countdown after about 12 seconds. Come back in time and the game goes on. If not, your friend wins by forfeit. Leaving the room during a game loses it.
- Our server stores each room (its code, who made it, a scrambled form of the maker's device id, and when it was made and last used), its two players (the username, avatar and flag as they were when each joined, and when we last heard from each), and each game (the colours, every move, and how it ended). A room nobody uses for 24 hours expires, and all of its data is deleted 30 days after its last use.
- A device can keep at most 3 rooms with games going. Making a new room closes your other rooms that have no game going.

## Moderation
- The owner of Checkervia keeps the leaderboard fair from a private dashboard that only the owner can sign in to, with a password and a second step from an authenticator app. It shows only what our server already stores, as listed here, and never your raw IP address.
- Our server also stores when you were last active (the time of your latest game result), which days you played (kept for about 400 days), and, for a suspension, who set it, why, and when it was set or changed. Totals per day (new profiles, games, wins, losses and resignations per level, and per flag) are kept for statistics and hold no names.
- A moderator may hide a profile or a win, change a username that breaks the rules, reset an avatar or a flag, suspend an account until a date or for good, stop a device from making a new profile, or remove a profile. While suspended your profile, wins and stats are kept, the game tells you how many days are left, and lifting a suspension restores everything.
- Every moderator action is recorded with the time, its reason and the username it was about. This record cannot be changed and is kept after a profile is removed, as proof of what was done. Looking at a profile in the dashboard is recorded too.

## Visitor and online counts
- A device is counted once per UTC day with a scrambled mark that changes daily. Marks older than two days are periodically cleared; daily totals remain.
- While a game is visible, an anonymous heartbeat sends its mode, level and chosen flag every 30 seconds. It expires after 75 seconds and stops when the game is hidden, left or finished. It contains no moves, names or profile keys.

## Contact
- Questions about these notices: checkvia.games@gmail.com.

## No warranty
- The game is provided as it is, without any warranty. It may change, stop working or go offline at any time.
