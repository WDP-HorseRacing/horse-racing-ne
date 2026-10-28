import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { FIREBASE_MESSAGING } from './firebase.token';

/**
 * Tên Firebase app của ứng dụng.
 */
const FIREBASE_APP_NAME = 'racehorse';

/**
 * Dựng Firebase Messaging từ service account trong env
 *
 * - Có đủ FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY: trả về Messaging
 * - Không cấu hình Firebase: trả về null
 * - FIREBASE_PRIVATE_KEY nhận được cả dạng `\n` viết liền một dòng
 *
 * @param config ConfigService của ứng dụng
 * @returns Messaging, hoặc null khi không cấu hình Firebase
 */
function createFirebaseMessaging(config: ConfigService): Messaging | null {
  const projectId = config.get<string>('FIREBASE_PROJECT_ID');
  const clientEmail = config.get<string>('FIREBASE_CLIENT_EMAIL');
  const privateKey = config.get<string>('FIREBASE_PRIVATE_KEY');
  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }
  const app = initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    },
    FIREBASE_APP_NAME,
  );
  return getMessaging(app);
}

@Global()
@Module({
  providers: [
    {
      provide: FIREBASE_MESSAGING,
      inject: [ConfigService],
      useFactory: createFirebaseMessaging,
    },
  ],
  exports: [FIREBASE_MESSAGING],
})
export class FirebaseModule {}
