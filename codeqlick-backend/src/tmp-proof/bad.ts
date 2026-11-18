import { exec } from 'node:child_process';
import jwt from 'jsonwebtoken';
import express from 'express';
const app = express();
app.get('/x', (req, res) => {
  exec('ls ' + req.query.dir);
  eval(req.query.code as string);
  res.send(jwt.sign({ a: 1 }, 'hardcoded-secret-key-value', { algorithm: 'none' }));
});
