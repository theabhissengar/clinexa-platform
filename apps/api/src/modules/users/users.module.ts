import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminRolesController } from './admin-roles.controller';
import { AdminUsersController } from './admin-users.controller';
import { CrmUsersController } from './crm-users.controller';
import { ProfileController } from './profile.controller';
import { RolesAdminService } from './roles-admin.service';
import { UserLifecycleService } from './user-lifecycle.service';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminUsersController,
    AdminRolesController,
    CrmUsersController,
    ProfileController,
  ],
  providers: [UsersService, UserLifecycleService, RolesAdminService],
  exports: [UsersService, UserLifecycleService],
})
export class UsersModule {}
