Parse.Cloud.define("playlistView", function(request, response) {
  Parse.Cloud.useMasterKey();

  var playlist = request.params.playlist;

  var query = new Parse.Query("Playlist");
  query.get(playlist).then(function(playlist) {
    playlist.increment("num_plays");
    return playlist.save();
  }, function() {
    response.error({error: "Invalid playlist id"});
  }).then(function(playlist) {
    response.success();
  }, function() {
    response.error({error: "Unable to save playlist"});
  });

});
