// The local chat lines around the AI's moves (D107, D161), one set per level
// in that level's voice: Easy warm, Medium playful, Hard cocky, Strongest
// savage. Turn cues follow any move, so they never judge the player;
// "ordinary" lines follow a move the engine found nothing special about, so
// they talk about the AI and the game (D155); "respect" lines follow a great
// move and read as respect, "slip" lines follow a blunder and never praise
// (D157). Tests check every line against the rules of its verdict.
import type { AiLevel } from "./difficulty";

export type ChatList = "cue" | "ordinary" | "respect" | "slip";

// The AI's own cue while it thinks, the same at every level.
export const AI_CUES: readonly string[] = ["My turn. Watch closely.", "Over to me.", "Let me think.", "My move next.", "I am up. Give me a moment.", "Time for my reply."];

export const CHAT_LINES: Readonly<Record<AiLevel, Readonly<Record<ChatList, readonly string[]>>>> = {
  1: {
    cue: ["My move. Your turn!", "Over to you.", "You are up.", "Your move. Make it count.", "The board is yours.", "On you now.", "Your turn. I am watching.", "All yours. Pick your next move."],
    ordinary: ["Let us see where this goes.", "This is a fun game.", "I am enjoying this one.", "I wonder what comes next.", "Every decision counts.", "This is getting interesting.", "Thanks for playing with me.", "I love a calm game like this."],
    respect: [
      "Well played! I did not see that coming.",
      "Great move! You made me think there.",
      "Wow, that was clever. Well done!",
      "Excellent move. I am impressed.",
      "That was sharp. Nice work!",
      "Brilliant! You earned that one.",
      "Good move! I have to think hard now.",
      "Well done. That was a strong move.",
      "That was impressive. Keep it up!",
      "Bravo! That move deserved a cheer.",
    ],
    slip: [
      "Oops, that one hands me a chance.",
      "Ah, that move opened a door for me.",
      "Oh no, I think that one helps me.",
      "Careful! That gave me an opening.",
      "Oops. Do not worry, it happens to everyone.",
      "Hmm, I think you will want that one back.",
      "That one slipped. Shake it off!",
      "Oh, that gives me a chance. Stay focused!",
      "A little slip there. You will get the next one.",
      "Oops, a small gift for me. Thank you!",
    ],
  },
  2: {
    cue: ["My move. Your turn, hehe!", "Over to you, rival.", "You are up. Surprise me.", "Your move. Make it fun.", "The board is yours, lol.", "On you now. Ready?", "Your turn. I am all ears.", "All yours. Go on, haha."],
    ordinary: ["Let us see where this goes, hehe.", "There is more to this game yet.", "I am having fun with this one.", "I am curious what comes next, lol.", "Things are heating up.", "This is getting interesting.", "I have a trick or two left.", "Keep it coming, haha."],
    respect: [
      "Okay, okay, well played, hehe.",
      "Ooh, sharp move. I did not see that, lol.",
      "Fine, that was clever. You got me there.",
      "Nice one! I need to wake up, haha.",
      "Hats off. That was a good move.",
      "Impressive. I will get you back, hehe.",
      "Credit where it is due. Well done.",
      "Sneaky and excellent. I like it, lol.",
      "Good move. My circuits are sweating, haha.",
      "Well played. Now I have to try harder, hehe.",
    ],
    slip: [
      "Oops, a gift for me, hehe.",
      "That move opened a door for me, lol.",
      "Whoops! I will happily take that one.",
      "Did you mean to do that, haha?",
      "Thanks for the present, hehe.",
      "Oh, that was a slip. My lucky day, lol.",
      "Hmm, I think that one backfired, haha.",
      "That plan needed another look, hehe.",
      "Ooh, an opening. Do not mind if I do, lol.",
      "Whoops. I saw that coming a mile away, haha.",
    ],
  },
  3: {
    cue: ["My move. Your turn.", "Over to you. I am ready.", "You are up. I already have a reply.", "Your move. Make it count.", "The board is yours, for now.", "On you. I like my chances.", "Your turn. I am watching closely.", "All yours. Take your best shot."],
    ordinary: ["I am just warming up.", "I already know my next reply.", "This is going my way, haha.", "I have seen this before. I know how it ends.", "Watch closely. I do not miss.", "I have more where that came from.", "Every step brings me closer, lol.", "My next move is already waiting."],
    respect: [
      "Fine. Well played. Do not get used to it.",
      "Sharp move. I will admit it, once.",
      "That was clever. Enjoy it while it lasts, haha.",
      "Credit where it is due. Now watch me reply.",
      "Okay, that was strong. I did not see it, lol.",
      "Fair enough, that worked. Once.",
      "Impressive. Rare, but impressive, haha.",
      "Good move. I respect it, grudgingly.",
      "You earned that one. Enjoy the moment, lol.",
      "Well done. That is the last one you get, haha.",
    ],
    slip: [
      "That was a gift. I will take it.",
      "You gave me an opening. No refunds.",
      "That plan needed another look.",
      "Thanks. I was hoping you would do that, haha.",
      "Big slip. I will make you pay for it, lol.",
      "That one cost you more than it cost me, lmao.",
      "I saw that mistake before you made it, haha.",
      "One slip is all I need, lol.",
      "That move just made my day, lmao.",
      "Careless. I love it, haha.",
    ],
  },
  4: {
    cue: ["My move. Your turn!", "On you. I am ready for anything.", "Your move. No excuses.", "You are up. I already know my reply.", "Your turn. My next move is waiting.", "Over to you. I am just warming up.", "Your move. I like where this is going.", "On you. I am in no hurry."],
    ordinary: ["I am just getting started.", "I already know my next three replies.", "I came for a challenge. I brought my best.", "I am not here to hand out compliments.", "Watch closely. I do not miss.", "This board belongs to me.", "I have patience. My mercy is another matter.", "Nobody outplays me twice."],
    respect: [
      "Fine. That earned a nod. Do not get used to it.",
      "Credit where it is due. Now keep it up.",
      "That was sharp. I am still not going easy.",
      "Respect. Once. Do not expect it twice.",
      "Well played. I hate saying that, lmao.",
      "Okay. Clever. Now watch me answer.",
      "Hats off, for one move only, haha.",
      "That one was excellent. Enjoy it, lol.",
      "I did not see that. Credit to you.",
      "Strong move. I admit it. Now I get serious.",
    ],
    slip: [
      "That was a gift, amateur. I will take it.",
      "What a blunder. Thanks for the present, lmao.",
      "Damn, that was a gift.",
      "You handed me that on a plate, noob, lol.",
      "That plan was trash. I will feast on it, haha.",
      "Blunder spotted. I do not forgive, lmao.",
      "Was that a move or a cry for help, clown, lol?",
      "Hell of a blunder. Thanks, haha.",
      "Even a scrub would have seen that one, lmao.",
      "That slip just cost you. Badly, haha.",
    ],
  },
};
