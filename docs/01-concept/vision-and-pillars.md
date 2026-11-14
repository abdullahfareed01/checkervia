# Vision and Design Pillars

## Vision
- A small, correct, readable checkers game that its author can fully explain, plus a demonstration of a safe LLM integration.

## Pillars
1. **Correct rules first.** No illegal move can ever be played, by human or AI.
2. **Explainable code.** Small pure functions, clear names, tests that read like the rules.
3. **Safe AI.** The model proposes, our code verifies. Key never leaves the server.
4. **Clear play.** Always obvious whose turn it is, which moves are legal, and what happened.
5. **Ship it.** A finished, deployed game beats a feature rich unfinished one.

## Success looks like
- Full two player game works with all rules.
- Full AI game with zero illegal moves played.
- Author can walk a mentor through the rules and move checking.
