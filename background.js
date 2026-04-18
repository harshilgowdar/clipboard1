const State = { Start: "START", Stop: "STOP" };

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: State.Start, title: "Start Fast Typing", contexts: ["all"] });
  chrome.contextMenus.create({ id: State.Stop, title: "Stop Typing", contexts: ["all"] });
});

chrome.contextMenus.onClicked.addListener(({ menuItemId }, tab) => {
  if (menuItemId === State.Start) startTyping(tab.id);
  else stopTyping(tab.id);
});

let activeTasks = {};

const keyMap = {
  "\n": { key: "Enter", code: "Enter", keyCode: 13 },
  "\r": { key: "Enter", code: "Enter", keyCode: 13 },
  " ": { key: " ", code: "Space", keyCode: 32 },
  "\t": { key: "Tab", code: "Tab", keyCode: 9 },
  ",": { key: ",", code: "Comma", keyCode: 188 },
  ".": { key: ".", code: "Period", keyCode: 190 },
  "!": { key: "!", code: "Digit1", keyCode: 49, shift: true },
  "?": { key: "?", code: "Slash", keyCode: 191, shift: true },
  "(": { key: "(", code: "Digit9", keyCode: 57, shift: true },
  ")": { key: ")", code: "Digit0", keyCode: 48, shift: true },
  "{": { key: "{", code: "BracketLeft", keyCode: 219, shift: true },
  "}": { key: "}", code: "BracketRight", keyCode: 221, shift: true },
  ":": { key: ":", code: "Semicolon", keyCode: 186, shift: true },
  ";": { key: ";", code: "Semicolon", keyCode: 186 },
};

const sendKey = async (tabId, char) => {
  const special = keyMap[char];

  if (special) {
    const modifiers = special.shift ? 8 : 0;
    
    await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
      type: "keyDown",
      key: special.key,
      code: special.code,
      windowsVirtualKeyCode: special.keyCode,
      nativeVirtualKeyCode: special.keyCode,
      modifiers: modifiers,
      text: (char === "\n" || char === "\r") ? "\r" : char,
      unmodifiedText: (char === "\n" || char === "\r") ? "\r" : char,
    });

    await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: special.key,
      code: special.code,
      windowsVirtualKeyCode: special.keyCode,
      nativeVirtualKeyCode: special.keyCode,
      modifiers: modifiers,
    });
  } else {
    // Normal characters → use insertText (clean, reliable for fast typing)
    await chrome.debugger.sendCommand({ tabId }, "Input.insertText", {
      text: char,
    });
  }
};

const startTyping = async (tabId) => {
  const taskId = Math.random();
  activeTasks[tabId] = taskId;

  try {
    await chrome.debugger.attach({ tabId }, "1.3");
  } catch (e) {
    console.warn("Debugger attach failed:", e.message);
  }

  const text = await readClipboard(tabId);
  if (!text) return stopTyping(tabId);

  const characters = [...text];

  for (const char of characters) {
    if (activeTasks[tabId] !== taskId) break;

    await sendKey(tabId, char);

    // Fast typing speed: 5ms delay to allow the DOM to breathe
    await new Promise(r => setTimeout(r, 5));
  }

  stopTyping(tabId);
};

const stopTyping = (tabId) => {
  delete activeTasks[tabId];
  chrome.debugger.detach({ tabId }).catch(() => {});
};

const readClipboard = async (tabId) => {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => navigator.clipboard.readText(),
    });
    return result;
  } catch (e) {
    return null;
  }
};