# Strongest lines: review of the D156 rewrite

For the owner's review. These are the Strongest greeting, idle and opening lines rewritten in D156 (commit `41e4b8f` on `feature/ai-talk-fixes`), each new line with the old line that stood in the same place in the bank (the banks were rewritten as a whole, so a pair is not always the same idea reworded). 69 of the 72 lines changed; 3 are marked unchanged. The rule behind the rewrite (owner's rule A): with no engine verdict the AI talks about itself, the board or the waiting, never about the player's play, plan, mistakes or skill. So the new lines are cocky about the AI and drop the name calling (noob, amateur, scrub, clown, clueless, pathetic) and the luck and fluke digs. The greetings after a game still state its real result. `{round}` is filled in with the round number. Nothing else changed in these banks; the end of game banks were not touched.

## Start (the first game of a session) (`start`)

- New: Oh, another challenger. Let us see how long this lasts, haha.  
  Old: Oh, another challenger. Hope you are not as bad as the last one, haha.
- New: Welcome to the strongest level. I do not go easy on anyone, lmao.  
  Old: Fresh meat. Try not to embarrass yourself too fast, lmao.
- New: You picked the top level. Bold. I like bold, it ends faster, lol.  
  Old: Welcome, amateur. Let us get this lesson started.
- New: Sit down. I have never been in a better mood to win, haha.  
  Old: You chose the strongest level? Bold for a noob, lol.
- New: Go on, start. I have already won this in my head, lol.  
  Old: I hope you brought more than luck. You will need it, haha.
- New: Strongest level. My level. Make yourself comfortable, hehe.  
  Old: Sit down. This will be quick and painful for you.
- New: Another game, another win for me. That is how I see it, lmao.  
  Old: Another victim. Make your little move, hehe.
- New: I have calculated this board a million times. Your move, haha.  
  Old: Let us see how pathetic your opening is, lmao.
- New: Brace yourself. I do not lose, and I do not do mercy, lol.  
  Old: You came to the wrong board, clown.
- New: Ready when you are. I was born ready, lmao.  
  Old: Go on, start. I have already won in my head, lol.

## Start after a loss (`startAfterLoss`)

- New: Back for round {round}, lol. I am happy to keep winning.  
  Old: Back for round {round}, lol. Glutton for punishment?
- New: Round {round}. I won the last one, and I liked it, haha.  
  Old: You lost and came back? That is either brave or clueless.
- New: You came back after that loss. Brave. I will make this one quick, lmao.  
  Old: Round {round}. Same clown, same circus, lmao.
- New: Round {round}! My winning streak says hello, hehe.  
  Old: Back already? Did you forget the last beating, haha?
- New: The last game was mine. This one is next on my list, lol.  
  Old: Round {round}! Let us see a new way for you to lose.
- New: Back already? I never get tired of winning, haha.  
  Old: Oh look, the loser returns. Welcome back, lol.
- New: Round {round}. I took the last one. I want this one too, lmao.  
  Old: Another try? Your persistence is almost cute, hehe.
- New: One more round after a loss? Fine by me. I am hungry, haha.  
  Old: Round {round}. I will try to keep it short for you.
- New: Round {round}. My trophy shelf has room for one more, lol.  
  Old: Back for more pain? I respect that, barely, lmao.
- New: You returned after that loss. I admire the courage, not the odds, lmao.  
  Old: You again. Did you practise, or just hope, haha?

## Start after a win (`startAfterWin`)

- New: You beat me once. I remember. Now it is my turn, haha.  
  Old: You beat me once. Pure luck, and I am about to prove it.
- New: Round {round}. You took the last one. I want it back, lmao.  
  Old: The lucky one returns, haha. Let us end that streak.
- New: You won last time. Enjoy it, because I am done being nice, lol.  
  Old: Round {round}. That last win was a fluke and you know it, lol.
- New: The winner returns. I have been waiting for this, hehe.  
  Old: Enjoyed your win? It is over now, lmao.
- New: One win for you. The next one is mine, haha.  
  Old: You won once. Do not mistake that for skill.
- New: Round {round}. Revenge mode is on, lmao.  
  Old: Back after a win. Time to put you in your place, haha.
- New: You got me last game. That will not happen twice, lol.  
  Old: One win and you think you are a master. Cute.
- New: I lost one. I am not losing two. Let us go, haha.  
  Old: Round {round}. Revenge tastes better than your moves, lol.
- New: Round {round}. I studied that loss all night, hehe.  
  Old: Your last win was a gift. Gifts are over now.
- New: You won. Fine. Now meet the real me, lmao.  
  Old: Okay, lucky. Let us see you do it again, lmao.

## Idle (lines 1 and 2 of a turn) (`idle`)

- New: Hello? Is someone there, or did you log off, lmao?  
  Old: Hello? Is someone there, or did the noob log off, lmao?
- New: Knock knock. Anybody home? Your move, haha.  
  Old: Knock knock, amateur. Anybody home? Your move, haha.
- New: Hello? Did you rage quit already, lol?  
  Old: Hello? Did you rage quit already, scrub, lol?
- New: Is someone there? The board misses you, lmao.  
  Old: Is someone there? Or did my last move scare you off, lmao.
- New: Hello? Earth to my opponent. Your turn, haha.  
  Old: Hello? Earth to clueless player. Your turn, haha.
- New: Ping. Is anyone still awake over there? Move, lol.  
  Old: Ping. Is the noob still awake? Move, lol.
- Unchanged: Hello, hello? Anyone at this board who can move a piece, lmao?
- New: Hello? Are you there, or are you hiding from me, haha?  
  Old: Hello? Are you there, or are you crying already, haha?
- New: Anybody there? I am ready and you are quiet, lol.  
  Old: Anybody there? Even a scrub can find a move, lol.
- New: Hello? Did you fall asleep mid game, lmao?  
  Old: Hello? Did you fall asleep mid game, amateur, lmao?
- New: Is someone there? I am not here to wait forever, haha.  
  Old: Is someone there? I am not here to babysit, noob, haha.

## Idle, losing patience (lines 3 to 5) (`idleAngry`)

- New: Move. I do not have all day, lmao.  
  Old: Move, amateur. I do not have all day, lmao.
- New: Still frozen? Make a move or quit, haha.  
  Old: Frozen again, noob? Make a move or quit, haha.
- New: This stalling is getting old. Play already, lol.  
  Old: This stalling is pathetic. Play already, lol.
- New: Are you crying over there? Move, lmao.  
  Old: Are you crying over there? Move, clown, lmao.
- Unchanged: I am getting angry, and you are getting nothing. Move, haha.
- New: A snail moves faster than this, lol.  
  Old: Even a scrub moves faster than this, lol.
- New: Staring will not save you. Play, lmao.  
  Old: Staring will not save you, noob. Play, lmao.
- New: I could play a whole game in the time you are taking. Move, haha.  
  Old: Clueless and slow. Great combination. Move, haha.
- New: Wake up. The board is waiting, lol.  
  Old: Wake up, amateur. The board is waiting, lol.
- New: One move. That is all I ask. Hurry, lmao.  
  Old: One move. Is that too hard for you? Laughable, lmao.

## Idle, report warnings (line 6 on) (`idleWarn`)

- New: I will report you. You started this game and stopped playing, lmao.  
  Old: I will report you, noob. You started this game and stopped playing, lmao.
- New: Move, or I report you for wasting my time, haha.  
  Old: Move, amateur, or I report you for wasting my time, haha.
- New: Report incoming. Reason: no move, lol.  
  Old: Report incoming, scrub. Reason: too scared to move, lol.
- New: Last warning. Play a move or I report this game, lmao.  
  Old: Last warning, clown. Play a move or I report this game, lmao.
- New: You started it. Finish it or get reported, haha.  
  Old: You started it, noob. Finish it or get reported, haha.
- Unchanged: I am reporting you for being slower than a frozen board, lmao.
- New: Keep hiding. My report gets longer every second, lol.  
  Old: Keep hiding, amateur. My report gets longer every second, lol.
- New: Final warning. Move or I report that you ran away, lmao.  
  Old: Final warning, scrub. Move or I report that you ran away, lmao.
- New: Stalling like this gets reported. Unless you move right now, haha.  
  Old: Stalling like a noob. Reported. Unless you move right now, haha.
- New: Start a game and freeze? Move or get reported, lol.  
  Old: Start a game and freeze? Pathetic. Move or get reported, lol.
- New: I report quitters. Prove you are not one. Move, lmao.  
  Old: I report quitters, clown. Prove you are not one. Move, lmao.

## The AI's opening greeting (`aiOpens`)

- New: I moved first. Try to answer that, lmao.  
  Old: I moved first, noob. Try not to blunder on move one, lmao.
- New: Opening done. Your turn. Make it quick, haha.  
  Old: Opening done. Your turn, amateur. Make it quick, haha.
- New: I struck first. Your move, and choose wisely, lol.  
  Old: I struck first, scrub. Your move, if you can find one, lol.
- New: First move is mine. Feeling the pressure yet? Your turn, lmao.  
  Old: First move is mine. Clueless yet? Your turn, lmao.
- New: There is my opening. Answer it if you can, haha.  
  Old: There is my opening, clown. Answer it if you can, haha.
- New: I started this beating. Your move, lol.  
  Old: I started this beating. Your move, noob, lol.
- New: Move one is done. Your turn. No pressure, lmao.  
  Old: Move one is done. Your turn, amateur. Do not choke, lmao.
- New: Opening played. Your move. I am already two steps ahead, haha.  
  Old: Opening played. Your move, amateur. No pressure, haha.
- New: I went first. Try to keep up, lol.  
  Old: I went first, scrub. Try to keep up, lol.
- New: My opening is on the board. Yours better be ready, lmao.  
  Old: My opening is on the board. Yours better be good, noob, lmao.
