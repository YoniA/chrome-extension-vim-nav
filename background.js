chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({
    text: "OFF",
  });
});


// on clicking the extension icon
chrome.action.onClicked.addListener(async (tab) => {
  const prevState = await chrome.action.getBadgeText({
    tabId: tab.id
  });
  
  // Next state will always be the opposite
  const nextState = prevState === 'ON' ? 'OFF' : 'ON'

  // Set the action badge to the next state
  await chrome.action.setBadgeText({
    tabId: tab.id,
    text: nextState,
  });

  if (nextState === "ON") {

  } else if (nextState === "OFF") {

  }


  chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      files: ["vim-scroll.js"],
    });

});
