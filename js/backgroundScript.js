// -----------------------------------------------------------------------------
// Parse
// -----------------------------------------------------------------------------
Parse.initialize("3LeDXoXIMPlclj6QhtMExSusuH9TIQcF3XSwkRcC", "rFGSoWE3oG7tiEidwu0rsaGYxUH1H35Fc3B7aMPf");

var User = Parse.User;

var Song = Parse.Object.extend("Song", {
  toJSON: function() {
    return {
      title: this.get("name"),
      video: this.get("videoId"),
      duration: this.get("duration"),
      id: this.id,
    };
  }
});

var Playlist = Parse.Object.extend("Playlist", {
  toJSON: function() {
    return {
      id: this.id,
      name: this.get("name"),
    }
  }
});


// -----------------------------------------------------------------------------
// Globals
// -----------------------------------------------------------------------------
var currentVideo = 0;
var currentPlaylist = false; // false means no playlist (all saved songs)
var isPlaying = false;
var volume = 50;
var isShuffle = false;
var isRepeat = true;

var videoTab = false;
var oldActiveTabId;

var savedVideos = [];
var videoOrder = [];
var playTubeUser;

var playlists = [];


// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
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

var getAllSongs = function(offset, allSongs, playlist, callback) {
  var songQuery = new Parse.Query(Song);

  if (playlist) {
    songQuery.equalTo("playlist", playlist);
  } else {
    songQuery.equalTo("user", playTubeUser);
  }

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

var isVideoAlreadySaved = function(videoId) {
  for (var x = 0; x < savedVideos.length; x++) {
    if (savedVideos[x].get("videoId") == videoId) {
      return true;
    }
  }

  return false;
};

var removeSong = function(song) {
  song.destroy();

  track("songRemove");
};

var addSong = function(song) {
  generateNewOrder();

  // Save to parse
  var songObj = new Song();
  songObj.set("videoId", song.video);
  songObj.set("name", song.title);
  songObj.set("duration", song.duration);
  songObj.set("user", playTubeUser);
  songObj.setACL(new Parse.ACL(playTubeUser));
  songObj.save().then(function(song) {
    savedVideos.push(song);
  });

  track("songAdd");
};

var getPlaylist = function(pid) {
  var playlist = playlists[pid];

  var relation = playlist.relation("songs");
  relation.query().limit(1000).find().then(function(songs) {
    sendMessage({
      action: "recievePlaylistSongs",
      songs: songs,
      name: playlist.get("name"),
      id: pid,
    });

    playlist.songs = songs;
  }, function() {
    console.log("Error", arguments);
  });
};

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
    if (tab.url.indexOf(savedVideos[video].get("videoId")) != -1 && !restart) {
      chrome.tabs.sendMessage(tab.id, {action: "clickVideo"});
    } else {
      chrome.tabs.update(tab.id, {
        url: "https://www.youtube.com/watch?v=" +
                savedVideos[video].get("videoId"),
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


// -----------------------------------------------------------------------------
// Chrome stuff
// -----------------------------------------------------------------------------

// Try to login
chrome.storage.sync.get("user", function(items) {
  // If we can login, we'll fetch our data from Parse
  if (items.user && items.user.username && items.user.password) {
    User.logIn(items.user.username, items.user.password).then(function(user) {
      playTubeUser = user;

      getAllSongs(0, [], null, function(songs) {
        for (var x in songs) {
          var song = songs[x];

          savedVideos.push(song);
        }

        generateNewOrder(true);
      });

      var query = new Parse.Query(Playlist);
      query.equalTo("user", user);
      query.limit(1000);
      query.find().then(function(plists) {
        playlists = plists;
      }, function() {
        console.log("Error", arguments);
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
    }, function() {
      console.log("Error", arguments);
    });
  }
});

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
        playlists: playlists,
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

    if (request.action == "addPlaylist") {
      var name = request.name;

      var playlist = new Playlist();
      playlist.set("name", name);
      playlist.set("user", playTubeUser);
      playlist.setACL(new Parse.ACL(playTubeUser));
      playlist.save().then(function(playlist) {
        playlists.push(playlist);

        sendResponse(playlist.id);
      });
    }

    if (request.action == "getPlaylistSongs") {
      getPlaylist(request.playlist);
    }

    if (request.action == "playlistAddSong") {
      var playlist = playlists[request.playlist];
      var song = savedVideos[request.song];

      var relation = playlist.relation("songs");

      relation.add(song);
    }

    if (request.action == "playlistRemoveSong") {
      var playlist = playlists[request.playlist];
      var song = savedVideos[request.song];

      var relation = playlist.relation("songs");

      relation.remove(song);
    }

    if (request.action == "editModeLeave") {
      var playlist = playlists[request.playlist];
      playlist.save().then(function() {
        getPlaylist(request.playlist);
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
