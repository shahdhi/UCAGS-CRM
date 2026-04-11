module.exports = (req, res) => {
  res.status(200).json({ success: true, status: 'OK', source: 'vercel-function' });
};
