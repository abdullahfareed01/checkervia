# Terms and notices (DRAFT)

> **Draft, not legal advice.** Written by the developer with an AI assistant for this hobby project. The owner should have it reviewed by someone qualified before relying on it. The app shows the same text (`src/ui/TermsDialog.tsx`); change both together.
>
> Notice version for the Strongest consent: 1 (`NOTICE_VERSION` in `src/ui/consent.ts`). Changing the Strongest notice text means bumping it, so everyone is asked again.
>
> The leaderboard section describes it as live (phase 4, D57), although nothing is deployed until the owner approves. "Reported" (games played and losses are not replay checked) is said here, not on the screens, as the owner asked.

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
- In your browser: your chosen level, your settings, your acceptance of the Strongest notice (the time and the notice version) and, for the leaderboard, a random device id, your profile's secret key and any win that could not be sent yet (kept for at most 7 days). Clearing your browser data removes them.
- In this tab only: your wins and losses against the AI, so it can greet you. They are gone when you close the tab.
- During a game, the board and the list of possible moves are sent to the AI provider so the AI can choose its move. No personal details are sent.
- On our server: only what the Leaderboard section below lists, and only once you choose a username.

## Leaderboard
- Before your first game against the AI you make a profile: a username, an avatar and a flag. Usernames are public and unique, and there is no tag. Please do not use your real name. Usernames are filtered, and names or entries that break these rules may be hidden or removed.
- Your username, avatar, flag and wins are public on the leaderboard.
- When you win a game against the AI, the win is submitted automatically after the result appears. Our server checks each one by replaying all of its moves. Two player games, resigned games and games the AI wins never count. If the win cannot be sent (for example while you are offline), it is kept in your browser for up to 7 days and sent by itself later.
- Your profile shows your games played, wins, losses and win rate. Wins are checked by replay. Games played and losses are reported by the game in your browser and are not checked by replay.
- Our server stores your username, your avatar (only which picture you chose), your flag, the level, moves and stats of each win, the results of your finished games against the AI, the date of your last username change, and the dates. It also stores scrambled (hashed) forms of a secret key and a random device id kept in your browser, and of your IP address. It never stores your raw IP address, your age or your email.
- The avatar groups (male, female, kid, older adult) only help you find a picture. Which group you looked at is never sent or stored.
- You choose your flag yourself, or Prefer not to show a flag. It is never guessed from your connection. You can change your flag and your avatar any time.
- You can change your username once every 7 days. Your old username stays reserved for you for 30 days, so nobody else can take it; after that it is free again. Your wins and stats stay with you.
- The scrambled device id and IP address are used only to limit how often requests can be made. They are never shown.
- Your profile belongs to the secret key kept in this browser. Clearing your browser data loses the profile, and its username stays taken.
- Anyone can view the leaderboard and the profiles on it, without choosing a username.
- To have a profile or an entry removed, email checkvia.games@gmail.com with the username and roughly when you submitted it.

## Contact
- Questions about these notices: checkvia.games@gmail.com.

## No warranty
- The game is provided as it is, without any warranty. It may change, stop working or go offline at any time.
