var http = require('http');

http.createServer(function (req, res) {
  res.write('Im Alive!');
  res.end();
}).listen(8080, () => {
  console.log('Server is running on http://localhost:8080');
});
