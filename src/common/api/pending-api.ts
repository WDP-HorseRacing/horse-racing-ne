import { NotImplementedException } from '@nestjs/common';

/** Contract-only routes fail closed until their authorization and service are implemented. */
export abstract class PendingApi {
  protected pending(): never {
    throw new NotImplementedException(
      'API contract is defined; authentication, authorization and service implementation are pending',
    );
  }
}
