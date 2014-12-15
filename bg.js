var sendMessage = function(message, callback) {
  chrome.runtime.sendMessage(message, callback);
};

var getVideoIdFromUrl = function(url) {
  if (url.indexOf("youtube.com") == -1) {
    return false;
  }

  var start = url.indexOf("v=");
  var end = url.indexOf("&", start);

  var video;
  if (end == -1) {
    video = url.substr(start+2);
  } else {
    video = url.substring(start+2, end);
  }

  return video;
};

var savedVideos;

chrome.storage.local.get("videos", function(items) {
  savedVideos = items.videos;
});

var isVideoAlreadySaved = function(videoId) {
  for (var x = 0; x < savedVideos.length; x++) {
    if (savedVideos[x].video == videoId) {
      return true;
    }
  }

  return false;
};

var saveVideos = function() {
  chrome.storage.local.set({videos: savedVideos});
};

var currentVideo = 0;
var isPlaying = false;
var volume = 50;

var videoTab = false;
var oldActiveTabId;

chrome.tabs.getSelected(null, function(tab) {
  oldActiveTabId = tab.id;
});

chrome.tabs.onRemoved.addListener(function(tabId) {
  if (tabId == videoTab.id) {
    isPlaying = false;
    videoTab = false;
  }
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
  if (tabId == videoTab.id && changeInfo.url &&
        getVideoIdFromUrl(changeInfo.url) != savedVideos[currentVideo].video) {
    isPlaying = false;
    sendMessage({action: "update", isPlaying: false});
  }
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
  var tabId = activeInfo.tabId;
  if (tabId == videoTab.id) {
    chrome.tabs.update(oldActiveTabId, {active: true});
  } else {
    oldActiveTabId = activeInfo.tabId;
  }
});

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log(request);

    if (request.action == "play") {
      playVideo(request.video);
    }

    if (request.action == "pause") {
      pauseVideo();
    }

    if (request.action == "next" || request.action == "songEnded") {
      nextVideo();
    }

    if (request.action == "previous") {
      previousVideo();
    }

    if (request.action == "state") {
      sendResponse({
        videos: savedVideos,
        currentVideo: currentVideo,
        isPlaying: isPlaying,
        volume: volume,
      });
    }

    if (request.action == "add") {
      savedVideos.push({
        video: request.video,
        title: request.title,
        duration: request.duration,
      });

      saveVideos();
    }

    if (request.action == "remove") {
      savedVideos.splice(request.video, 1);

      if (currentVideo > request.video) {
        currentVideo--;
      }

      saveVideos();
    }

    if (request.action == "isPlayTab") {
      sendResponse({
        isPlayTab: videoTab.id == sender.tab.id,
        volume: volume,
      });
    }

    if (request.action == "updateVolume") {
      chrome.tabs.sendMessage(videoTab.id, {
        action: "updateVolume",
        volume: request.volume
      });
      volume = request.volume;
    }

    if (request.action == "updateLocation") {
      chrome.tabs.sendMessage(videoTab.id, {
        action: "updateLocation",
        location: request.location
      });
    }

    if (request.action == "isVideoAlreadySaved") {
      sendResponse(isVideoAlreadySaved(request.videoId));
    }
  }
);

var createVideoTabIfNotExists = function(callback) {
  if (!videoTab) {
    chrome.tabs.create({active: false}, function(tab) {
      videoTab = tab;

      callback(tab);
    });
  } else {
    chrome.tabs.get(videoTab.id, function(tab) {
      callback(tab);
    });
  }
};

var playVideo = function(video) {
  createVideoTabIfNotExists(function(tab) {
    if (tab.url.indexOf(savedVideos[video].video) != -1) {
      chrome.tabs.sendMessage(tab.id, {action: "clickVideo"});
    } else {
      chrome.tabs.update(tab.id, {
        url: "https://www.youtube.com/watch?v=" + savedVideos[video].video,
        pinned: true
      });
    }

    currentVideo = parseInt(video);
    isPlaying = true;
  });
};

var pauseVideo = function() {
  if (!isPlaying) {
    return;
  }

  chrome.tabs.sendMessage(videoTab.id, {action: "clickVideo"});

  isPlaying = false;
};

var nextVideo = function() {
  if (currentVideo == savedVideos.length - 1) {
    playVideo(0);
  } else {
    playVideo(currentVideo + 1);
  }
};

var previousVideo = function() {
  if (currentVideo == 0) {
    playVideo(savedVideos.length - 1);
  } else {
    playVideo(currentVideo - 1);
  }
};
