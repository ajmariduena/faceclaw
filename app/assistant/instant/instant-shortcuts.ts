/**
 * Exact commands answered on the phone without a model call: a timer, the
 * music, the time. Anything that does not match goes to the model.
 */

export type Shortcut =
  | { kind: "tool"; tool: string; args: Record<string, unknown> }
  | { kind: "time" };

const NUMBERS: Record<string, number> = {
  un: 1, una: 1, uno: 1, one: 1, a: 1, an: 1, dos: 2, two: 2, tres: 3, three: 3, cuatro: 4, four: 4, cinco: 5, five: 5,
  seis: 6, six: 6, siete: 7, seven: 7, ocho: 8, eight: 8, nueve: 9, nine: 9, diez: 10, ten: 10, quince: 15, fifteen: 15,
  veinte: 20, twenty: 20, treinta: 30, thirty: 30, cuarenta: 40, forty: 40, sesenta: 60, sixty: 60,
};

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,]/g, " ").replace(/\s+/g, " ").trim();
}

function amount(word: string): number {
  const n = Number(word);
  return Number.isFinite(n) && n > 0 ? n : NUMBERS[word] ?? 0;
}

const UNITS: Record<string, "hours" | "minutes" | "seconds"> = {
  hora: "hours", horas: "hours", hour: "hours", hours: "hours",
  minuto: "minutes", minutos: "minutes", minute: "minutes", minutes: "minutes", min: "minutes",
  segundo: "seconds", segundos: "seconds", second: "seconds", seconds: "seconds",
};

export function matchShortcut(question: string): Shortcut | null {
  const text = normalize(question);
  const timer = /^(?:(?:pon|ponme|crea|inicia|arranca|activa) (?:un |una )?(?:timer|temporizador)|(?:set|start) (?:a )?timer|timer)(?: de| for| of)? (\d+|[a-z]+) (horas?|minutos?|segundos?|hours?|minutes?|min|seconds?)$/.exec(text);
  if (timer) {
    const n = amount(timer[1]);
    const unit = UNITS[timer[2]];
    if (n > 0 && unit) return { kind: "tool", tool: "timer.set", args: { [unit]: n } };
  }
  if (/^(?:pon(?:me)? )?(?:un |una )?(?:timer|temporizador) de media hora$/.test(text)) return { kind: "tool", tool: "timer.set", args: { minutes: 30 } };
  if (/^(?:pausa|pausala|pon pausa|para|deten|detén) (?:a |la )?(?:musica|cancion)$|^(?:pause|stop) (?:the )?music$/.test(text)) return { kind: "tool", tool: "media.play_pause", args: {} };
  if (/^(?:reanuda|continua|sigue con|pon|play) (?:la )?(?:musica|music)$|^(?:resume|play) (?:the )?music$/.test(text)) return { kind: "tool", tool: "media.play_pause", args: {} };
  if (/^(?:siguiente|pasa(?:la)?|cambia(?:la)?|salta(?:la)?) ?(?:cancion|tema)?$|^(?:next|skip)(?: song| track)?$/.test(text)) return { kind: "tool", tool: "media.next", args: {} };
  if (/^(?:que hora es|que horas son|me dices la hora|what time is it|what s the time)$/.test(text)) return { kind: "time" };
  return null;
}
