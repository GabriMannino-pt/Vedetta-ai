import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfig } from './types';

dotenv.config();

const configPath = path.resolve(__dirname, '..', 'config.json');

if (!fs.existsSync(configPath)) {
  console.error(`[CONFIG] ❌ File config.json non trovato in: ${configPath}`);
  process.exit(1);
}

export const appConfig: AppConfig = JSON.parse(
  fs.readFileSync(configPath, 'utf-8')
);

/** Legge una variabile d'ambiente obbligatoria, esce se mancante */
export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`[CONFIG] ❌ Variabile d'ambiente mancante: ${name}`);
    process.exit(1);
  }
  return val;
}

/** Legge una variabile d'ambiente opzionale */
export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}
