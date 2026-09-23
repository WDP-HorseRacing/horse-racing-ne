import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { GroomAssignmentsController } from './groom-assignments.controller';

function routesOf(): { method: RequestMethod; path: string }[] {
  const prototype = GroomAssignmentsController.prototype as unknown as Record<
    string,
    unknown
  >;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => prototype[name])
    .filter((handler): handler is object => typeof handler === 'function')
    .filter((handler) => Reflect.hasMetadata(PATH_METADATA, handler))
    .map((handler) => ({
      method: Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod,
      path: Reflect.getMetadata(PATH_METADATA, handler) as string,
    }));
}

describe('GroomAssignmentsController', () => {
  it('offers assign and change of the groom but no route to remove it', () => {
    const groomRoutes = routesOf().filter(
      ({ path }) => path === 'horses/:id/groom',
    );
    expect(groomRoutes).toEqual([
      { method: RequestMethod.PUT, path: 'horses/:id/groom' },
    ]);
  });
});
