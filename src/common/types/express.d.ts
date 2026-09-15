import type { Actor } from '../auth/actor';

// declare global la BAT BUOC: ngay khi file co import o cap cao nhat, TypeScript
// coi no la module, va mot `declare namespace Express` tran se chi con pham vi
// cuc bo - khong bao loi gi, nhung ca khoi mat tac dung, keo theo correlationId
// dang chay tot cung mat type.
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      /** Chu the cua token da verify; co tren moi request khong phai @Public(). */
      actor?: Actor;
    }
  }
}
export {};
