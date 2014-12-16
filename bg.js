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
var videoOrder = [];

chrome.storage.local.get("videos", function(items) {
  savedVideos = items.videos || [];

  generateNewOrder();
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
var isShuffle = false;
var isRepeat = true;

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
  // TODO possibly add this back
  // if (tabId == videoTab.id && changeInfo.url &&
  //       getVideoIdFromUrl(changeInfo.url) != savedVideos[videoOrder[currentVideo]].video) {
  //   isPlaying = false;
  //   sendMessage({action: "update", isPlaying: false});
  // }

  if (changeInfo.url && changeInfo.url.indexOf("youtube") != -1) {
    chrome.tabs.getSelected(null, function(tab) {
      chrome.tabs.sendMessage(tab.id, {action: "urlChanged"});
    });
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
        currentVideo: videoOrder[currentVideo],
        isPlaying: isPlaying,
        volume: volume,
        isShuffle: isShuffle,
        isRepeat: isRepeat,
      });
    }

    if (request.action == "add") {
      savedVideos.push({
        video: request.video,
        title: request.title,
        duration: request.duration,
      });

      generateNewOrder();

      saveVideos();
    }

    if (request.action == "remove") {
      savedVideos.splice(request.video, 1);

      var toRemove = [];

      for (var x in videoOrder) {
        var vidId = videoOrder[x];

        // We need to remove anything which references the highest song
        // since there's one less song now.
        // Anything we remove that's before our current song, we should also
        // decrease the current song index so we account for that.
        if (vidId == savedVideos.length) {
          toRemove.push(x);
          if (currentVideo > x) {
            currentVideo--;
          }
        }
      }

      for (var x in toRemove) {
        videoOrder.splice(toRemove[x], 1);
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

    if (request.action == "shuffleToggle") {
      isShuffle = request.isShuffle;

      generateNewOrder();
    }
  }
);

var generateNewOrder = function() {
  saveVideos[videoOrder[currentVideo]];

  if (isShuffle) {
    // We want to generate a shuffled list FOLLOWING the current song
    currentVideo;

    var tempList = [];
    for (var x = 0; x < savedVideos.length; x++) {
      if (videoOrder[currentVideo] == x) continue;

      tempList.push({
        number: x,
        random: Math.random(),
      });
    }

    tempList.sort(function(a, b) {
      return a.random - b.random;
    });

    videoOrder = videoOrder.splice(0, currentVideo + 1)
      .concat(tempList.map(function(x) {
        return x.number;
    }));

  } else {
    videoOrder = videoOrder.splice(0, currentVideo + 1);

    for (var x = 0; x < savedVideos.length; x++) {
      if (videoOrder[currentVideo] == x) continue;
      videoOrder.push(x);
    }
  }
};

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

var playVideo = function(video, relative) {
  if (relative) {
    var relativeVideo = video;
    video = videoOrder[video];
  } else {
    var relativeVideo = 0;
    for (var x in videoOrder) {
      if (videoOrder[x] == video) {
        relativeVideo = x;
        break;
      }
    }
  }

  createVideoTabIfNotExists(function(tab) {
    if (tab.url.indexOf(savedVideos[video].video) != -1) {
      chrome.tabs.sendMessage(tab.id, {action: "clickVideo"});
    } else {
      chrome.tabs.update(tab.id, {
        url: "https://www.youtube.com/watch?v=" +
                savedVideos[video].video,
        pinned: true
      });
    }

    currentVideo = parseInt(relativeVideo);
    isPlaying = true;

    sendMessage({
      action: "currentVideoUpdate",
      currentVideo: video,
    });
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
  if (currentVideo == videoOrder.length - 1) {
    // If we're shuffling we need to create a new order of shuffled songs
    // If we're not shuffling, this won't really do anything
    generateNewOrder();
  }
  playVideo(currentVideo + 1 % videoOrder.length, true);
};

var previousVideo = function() {
  if (currentVideo == 0) {
    playVideo(videoOrder.length - 1, true);
  } else {
    playVideo(currentVideo - 1, true);
  }
};
