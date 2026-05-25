INTERESTED_KEYWORDS = [
    "interested", "yes", "sure", "tell me more", "sounds good", "great",
    "ok", "okay", "good", "definitely", "absolutely", "i'm in", "im in",
    "let's do", "lets do", "when can we", "how much", "commission",
    "how does it work", "send details", "more info",
]

NOT_INTERESTED_KEYWORDS = [
    "not interested", "no thanks", "no thank you", "don't contact", "do not contact",
    "stop", "unsubscribe", "remove me", "not for me", "not now", "busy",
    "no", "nope", "pass", "decline",
]

HAS_CLIENT_KEYWORDS = [
    "i have a client", "have a client", "client ready", "someone interested",
    "my client", "i know someone", "friend looking", "looking to buy",
    "wants to buy", "needs a property", "looking for property",
    "client wants", "i can refer", "can refer",
]


def analyze_reply(message: str) -> str:
    text = message.lower().strip()

    for kw in HAS_CLIENT_KEYWORDS:
        if kw in text:
            return "has_client"

    for kw in NOT_INTERESTED_KEYWORDS:
        if kw in text:
            return "not_interested"

    for kw in INTERESTED_KEYWORDS:
        if kw in text:
            return "interested"

    return "interested"
