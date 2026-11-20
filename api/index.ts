import 'dotenv/config';

import './routes.js';

import { app } from './lib/functionsRuntime.js';

const PORT = Number(process.env.PORT ?? 7071);
app.listen(PORT);
