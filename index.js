//Vercel entrypoint
// This tells Vercel: "I am the entry point, and I am healthy."
module.exports = (req, res) => {
  res.status(200).send('Smart Meter Cloud API is Online');
};