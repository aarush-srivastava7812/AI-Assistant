import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(cleanup);
if(typeof HTMLDialogElement!=='undefined'){
Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { value() { this.open = true; } });
Object.defineProperty(HTMLDialogElement.prototype, 'close', { value() { this.open = false; } });
}
