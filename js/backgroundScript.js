Parse.initialize("3LeDXoXIMPlclj6QhtMExSusuH9TIQcF3XSwkRcC", "rFGSoWE3oG7tiEidwu0rsaGYxUH1H35Fc3B7aMPf");

var User = Parse.User;
var Song = Parse.Object.extend("Song");


var track = function(event, dimensions) {
  Parse.Analytics.track(event, dimensions);
};

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

var savedVideos = [];
var videoOrder = [];
var playTubeUser;

var generateRandomString = function(length) {
  var str = "";
  for (var x=0; x<length; x++) {
    str += String.fromCharCode(Math.floor(Math.random() * 92 + 33));
  }

  return str;
};

var generateRandomAlphaString = function(length) {
  var str = "";
  for (var x=0; x<length; x++) {
    str += String.fromCharCode(Math.floor(Math.random() * 25 + 97));
  }

  return str;
};

var saveOldStyleVideos = function() {
  chrome.storage.local.get("videos", function(items) {
    if (items.videos) {
      var objects = [];
      for (var x in items.videos) {
        var song = items.videos[x];

        var songObj = new Song();
        songObj.set("videoId", song.video);
        songObj.set("name", song.title);
        songObj.set("duration", song.duration);
        songObj.set("user", playTubeUser);
        songObj.setACL(new Parse.ACL(playTubeUser));
        objects.push(songObj);

        savedVideos.push(song);
      }

      generateNewOrder();

      Parse.Object.saveAll(objects);

      chrome.storage.local.remove("videos");
    }
  });
};

var getAllSongs = function(offset, allSongs, callback) {
  var songQuery = new Parse.Query(Song);
  songQuery.equalTo("user", playTubeUser);
  songQuery.skip(offset).limit(1000);
  songQuery.find().then(function(songs) {
    allSongs = allSongs.concat(songs);

    if (songs.length < 1000) {
      callback(allSongs);
      return;
    }

    getAllSongs(offset + 1000, allSongs, callback);
  }, function() {
    console.log("Error", arguments);
  });
};

// Try to login
chrome.storage.sync.get("user", function(items) {
  // If we can login, we'll fetch our data from Parse
  if (items.user && items.user.username && items.user.password) {
    User.logIn(items.user.username, items.user.password).then(function(user) {
      playTubeUser = user;

      getAllSongs(0, [], function(songs) {
        for (var x in songs) {
          var song = songs[x];

          savedVideos.push({
            title: song.get("name"),
            video: song.get("videoId"),
            duration: song.get("duration"),
            id: song.id,
          });
        }

        generateNewOrder(true);
      });
    }, function(error) {
      console.log("Error", arguments);
    });
  } else {
    // Otherwise, we need to make a new user and save it
    var username = generateRandomString(20);
    var password = generateRandomString(20);

    var user = new User();
    user.set("username", username);
    user.set("password", password);
    user.set(
      "email",
      generateRandomAlphaString(4) + "@" + generateRandomAlphaString(4) + ".com"
    );
    user.signUp().then(function(user) {
      playTubeUser = user;

      chrome.storage.sync.set({
        user: {
          username: username,
          password: password
        }
      });

      // Check if we had the old style of videos saved locally
      saveOldStyleVideos();
    }, function() {
      console.log("Error", arguments);
    });
  }
});

var isVideoAlreadySaved = function(videoId) {
  for (var x = 0; x < savedVideos.length; x++) {
    if (savedVideos[x].video == videoId) {
      return true;
    }
  }

  return false;
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

var addSong = function(song) {
  savedVideos.push(song);

  generateNewOrder();

  // Save to parse
  var songObj = new Song();
  songObj.set("videoId", song.video);
  songObj.set("name", song.title);
  songObj.set("duration", song.duration);
  songObj.set("user", playTubeUser);
  songObj.setACL(new Parse.ACL(playTubeUser));
  songObj.save();

  track("songAdd");
};

var removeSong = function(song) {
  var query = new Parse.Query(Song);
  query.get(song.id).then(function(song) {
    song.destroy();
  }, function() {
    console.log("Error", arguments);
  });

  track("songRemove");
};

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
      track("browserActionClick");
    }

    if (request.action == "add") {
      addSong({
        video: request.video,
        title: request.title,
        duration: request.duration,
      });
    }

    if (request.action == "remove") {
      var removedSong = savedVideos.splice(request.video, 1)[0];

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

      removeSong(removedSong);
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

      track("locationUpdate");
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

var generateNewOrder = function(initial) {
  if (initial) {
    for (var x = 0; x < savedVideos.length; x++) {
      videoOrder.push(x);
    }

    return;
  }

  if (isShuffle) {
    // We want to generate a shuffled list FOLLOWING the current song
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

    var actualCurrentVideo = videoOrder[currentVideo] || 0;

    for (var x = 0; x < savedVideos.length; x++) {
      if (actualCurrentVideo == x) continue;
      videoOrder.push(x + actualCurrentVideo + 1 % savedVideos.length);
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

var playVideo = function(video, relative, restart) {
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
    if (tab.url.indexOf(savedVideos[video].video) != -1 && !restart) {
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
  playVideo(currentVideo + 1 % videoOrder.length, true, true);
};

var previousVideo = function() {
  if (currentVideo == 0) {
    playVideo(videoOrder.length - 1, true, true);
  } else {
    playVideo(currentVideo - 1, true, true);
  }
};


chrome.commands.onCommand.addListener(function(command) {
  if (command == "mediaNextSong") {
    nextVideo();
  }

  if (command == "mediaPreviousSong") {
    previousVideo();
  }

  if (command == "mediaPlayPause") {
    if (!isPlaying) {
      playVideo(currentVideo, true);
    } else {
      pauseVideo();
    }
  }
});
