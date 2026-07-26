import { Module } from '@nestjs/common';

import { AuthorizationService } from './authorization.service';
import { PERMISSION_LOADER } from './constants/rbac.constants';
import { PermissionsGuard } from './guards/permissions.guard';
import { PostgresPermissionLoader } from './permission-loader';
import { RbacController } from './rbac.controller';

@Module({
  controllers: [RbacController],
  providers: [
    AuthorizationService,
    PermissionsGuard,
    {
      provide: PERMISSION_LOADER,
      useClass: PostgresPermissionLoader,
    },
  ],
  exports: [AuthorizationService, PermissionsGuard],
})
export class RbacModule {}
