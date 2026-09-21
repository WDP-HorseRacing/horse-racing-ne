# Hướng dẫn phát triển module lớn

Tài liệu này mô tả cách tổ chức một module nghiệp vụ lớn theo cấu trúc của
`src/modules/training/`. Mục tiêu là để mỗi domain có ranh giới rõ ràng,
controller mỏng, business logic nằm trong service và các quy tắc quan trọng có
thể kiểm thử độc lập.

## Phạm vi áp dụng

Đây là quy chuẩn bắt buộc cho domain nghiệp vụ có nhiều nhóm use case hoặc
nhiều resource có vòng đời riêng. Các nhóm use case có thể phát triển, kiểm
thử và phân quyền độc lập phải nằm trong feature module riêng; module domain
chỉ lắp ráp chúng.

Module nhỏ, module hạ tầng hoặc module chỉ có một use case gắn kết có thể giữ
cấu trúc gọn. Không tạo feature/shared/policy folder rỗng chỉ để khớp cây thư
mục mẫu. Khi một module gọn phát triển thành nhiều nhóm use case, cần chuyển nó
sang cấu trúc trong guide này.

Các quy tắc về ranh giới module, sở hữu entity/provider và composition root ở
các mục dưới đây là yêu cầu bắt buộc khi module thuộc phạm vi áp dụng. Các gợi ý
về repository, policy, transaction và event được áp dụng theo nghiệp vụ thực tế;
không tạo abstraction nếu không đem lại ranh giới hoặc ý nghĩa rõ ràng.

## 1. Cấu trúc tổng quát

Một module lớn nên được chia thành module cha, các feature module con và phần
dùng chung của domain:

```text
src/modules/<domain>/
├── <domain>.module.ts             # Module cha, chỉ ghép các feature
├── enums/                         # Enum/trạng thái chỉ thuộc domain
├── dto/                           # Request DTO và response DTO
│   └── index.ts
├── entities/                      # TypeORM entities của domain
├── mappers/                       # Entity -> response DTO
├── policies/                      # Rule thuần, không gọi DB/HTTP
├── shared/                        # Access service, module dùng chung
│   ├── <domain>-access.service.ts
│   └── <domain>-shared.module.ts
└── <feature>/                     # Mỗi use-case group là một module con
    ├── <feature>.module.ts
    ├── <feature>.controller.ts
    ├── <feature>.service.ts
    └── <feature>.repository.ts       # tùy chọn, chỉ khi có query đáng gom riêng
```

Ví dụ thực tế:

```text
training/
├── training.module.ts
├── constants/
├── dto/
├── entities/
├── mappers/
├── policies/
├── shared/
├── training-plans/
├── training-sessions/
├── time-trials/
└── trainging-evaluations/
```

Tên thư mục feature nên dùng danh từ số nhiều (`training-plans`, `races`,
`supplies`). Khi tạo mới nên dùng chính tả đúng; thư mục
`trainging-evaluations` trong code hiện tại là tên cũ cần giữ để tránh làm hỏng
import, nhưng feature mới nên đặt là `training-evaluations`.

## 2. Module cha và module con

Module cha không nên chứa controller/service nghiệp vụ. Nó chỉ lắp ráp các
feature module:

```ts
// training.module.ts
@Module({
  imports: [
    TrainingPlansModule,
    TrainingSessionsModule,
    TimeTrialsModule,
    EvaluationsModule,
  ],
})
export class TrainingModule {}
```

Module con khai báo đúng entity, controller và provider mà nó sở hữu:

```ts
// training-plans.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([TrainingPlanEntity]),
    TrainingSharedModule,
  ],
  controllers: [TrainingPlansController],
  providers: [TrainingPlansService],
  exports: [TrainingPlansService],
})
export class TrainingPlansModule {}
```

Quy tắc:

- Entity được inject bằng `TypeOrmModule.forFeature` trong module sở hữu nó.
- Chỉ export service/repository thật sự được feature khác dùng.
- Không export tất cả provider theo thói quen.
- Nếu hai feature dùng chung access/auth logic, đưa logic đó vào `shared/` và
  export từ shared module.
- Đừng import ngược feature module này vào feature module kia; nếu có vòng phụ
  thuộc, chuyển phần chung lên `shared/` hoặc một domain service riêng.

## 3. Entity, enum và migration

Entity chỉ mô tả persistence model. Enum trạng thái đặt trong `constants/`
hoặc `enums/`, không nhúng các rule chuyển trạng thái vào entity.

```ts
@Entity({ name: 'training_plans' })
export class TrainingPlanEntity extends SoftDeletableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: TrainingPlanStatus;
}
```

Sau khi thay đổi entity, tạo migration và review SQL trước khi chạy:

```bash
pnpm db:generate src/migrations/AddTrainingPlanField
pnpm db:migrate
```

Không bật `synchronize` để sửa schema tự động. Foreign key, index, unique
constraint và soft-delete condition phải được thể hiện rõ trong migration.

## 4. DTO và mapper

DTO được chia thành input và output, có validation và OpenAPI metadata. Không
trả trực tiếp entity ra HTTP response vì entity có thể chứa `keycloakId`,
`passwordHash` hoặc field nội bộ khác.

```ts
export class CreateTrainingPlanDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  phaseName!: string;
}

export class TrainingPlanResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;
}
```

Mapper là nơi duy nhất chuyển entity sang response DTO:

```ts
export function toTrainingPlanResponse(
  entity: TrainingPlanEntity,
): TrainingPlanResponseDto {
  return plainToInstance(TrainingPlanResponseDto, entity, {
    excludeExtraneousValues: true,
  });
}
```

Với domain có nhiều DTO, export chúng từ `dto/index.ts` để import thống nhất.
Không gộp DTO của các domain khác nhau vào một file chung; chỉ gộp khi chúng
cùng thuộc một bounded context và không làm file quá khó đọc.

## 5. Controller: chỉ nhận request và chuyển tiếp

Controller chịu trách nhiệm route, parse input, authorization tĩnh và Swagger.
Không viết query, transaction hay business rule trong controller.

```ts
@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class TrainingPlansController {
  constructor(private readonly plans: TrainingPlansService) {}

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('horses/:horseId/training-plans')
  @ApiCreatedResponse({ type: TrainingPlanResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CreateTrainingPlanDto,
  ) {
    return this.plans.createTrainingPlan(actor, horseId, body);
  }
}
```

Checklist cho controller:

- Route param UUID dùng `ParseUUIDPipe`.
- Route cần đăng nhập có `@ApiBearerAuth()` và `@CurrentUser()`.
- Role tổng quát dùng `@Access(...)`; quyền theo ownership/barn/resource phải
  kiểm tra tiếp trong service.
- Khai báo `@ApiOperation`, `@ApiOkResponse` hoặc `@ApiCreatedResponse`.
- Tên method mô tả use case (`activate`, `complete`, `cancel`), không dùng
  method chung chung nếu làm mất ý nghĩa nghiệp vụ.

## 6. Service: orchestration và business workflow

Service là nơi điều phối access check, policy, truy vấn dữ liệu, transaction và
event. CRUD và query TypeORM thông thường có thể dùng `Repository<Entity>` được
inject trực tiếp; repository riêng chỉ cần khi query đáng gom thành abstraction
có tên nghiệp vụ hoặc logic phức tạp. Một method service nên tương ứng với một
use case của API.

```ts
@Injectable()
export class TrainingPlansService {
  constructor(
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async activatePlan(
    actor: Actor,
    planId: string,
  ): Promise<TrainingPlanResponseDto> {
    const updated = await this.dataSource.transaction(async (manager) => {
      const plan = await this.access.lockedPlan(manager, planId);
      assertPlanActivatable(plan.status);
      plan.status = TrainingPlanStatus.ACTIVE;
      plan.activatedAt = new Date();
      return manager.save(plan);
    });

    return toTrainingPlanResponse(updated);
  }
}
```

Trình tự nên theo mẫu:

1. Resolve actor và local user đang `ACTIVE`.
2. Kiểm tra resource tồn tại và quyền trên resource.
3. Nếu có invariant liên quan nhiều row, mở transaction.
4. Lock row cần bảo vệ trước khi kiểm tra invariant.
5. Chạy policy thuần để kiểm tra trạng thái/input.
6. Ghi dữ liệu bằng `EntityManager` của transaction.
7. Commit xong mới publish domain event.
8. Map entity thành response DTO.

Trong transaction phải dùng `manager` cho toàn bộ query có liên quan. Không dùng
repository ngoài transaction vì query đó có thể chạy bằng connection khác và
không được lock/rollback cùng transaction.

## 7. Repository và TypeORM

Repository riêng phù hợp khi query có tên nghiệp vụ, được dùng lặp lại hoặc
cần gom query phức tạp. Ví dụ dưới đây lọc trạng thái, join race, chọn cột và
sắp xếp kết quả trong cùng một truy vấn:

```ts
@Injectable()
export class RacingRepository {
  constructor(
    @InjectRepository(RaceRegistrationEntity)
    private readonly registrations: Repository<RaceRegistrationEntity>,
  ) {}

  listResultsByHorse(horseId: string): Promise<RaceRegistrationEntity[]> {
    return this.registrations
      .createQueryBuilder('registration')
      .innerJoinAndSelect('registration.race', 'race')
      .where('registration.horseId = :horseId', { horseId })
      .andWhere('registration.resultStatus IS NOT NULL')
      .orderBy('race.scheduledAt', 'DESC')
      .getMany();
  }
}
```

Không tạo repository chỉ để bọc một cách gọi TypeORM không có thêm ý nghĩa.
Với CRUD đơn giản hoặc các lệnh `find`/`findOne` có điều kiện và sắp xếp
thông thường, inject trực tiếp vào service:

```ts
constructor(
  @InjectRepository(SupplyItemEntity)
  private readonly items: Repository<SupplyItemEntity>,
) {}
```

Trong trường hợp transaction:

```ts
await this.dataSource.transaction(async (manager) => {
  const repo = manager.getRepository(TrainingPlanEntity);
  await repo.save(plan);
});
```

`DataSource` vẫn cần thiết cho transaction, lock và query nhiều entity; không
thay toàn bộ bằng injected repository.

## 8. Shared access service và policy

`TrainingAccessService` gom các kiểm tra dùng chung như:

- current user còn tồn tại và đang active;
- horse/plan/session tồn tại;
- truy cập theo barn của Head Trainer;
- groom được gán vào session;
- pessimistic lock cho resource.

Access service có thể gọi database. Ngược lại, policy trong `policies/` nên là
function thuần, nhận state và ném exception khi state không hợp lệ:

```ts
export function assertPlanActivatable(status: TrainingPlanStatus): void {
  if (status !== TrainingPlanStatus.SCHEDULED) {
    throw new ConflictException('Chỉ được kích hoạt plan SCHEDULED');
  }
}
```

Không đặt query DB, gọi Keycloak hay gọi HTTP trong policy. Nhờ vậy policy có
thể unit test nhanh mà không cần khởi động Nest hoặc database.

## 9. Domain event và side effect

Nếu workflow làm thay đổi trạng thái nghiệp vụ quan trọng, có thể publish event
qua `DomainEventPublisher` sau khi transaction hoàn tất:

```ts
const plan = await this.dataSource.transaction(async (manager) => {
  // update và save trong transaction
  return manager.save(current);
});

this.events.publish('training.plan.completed', {
  planId: plan.id,
  horseId: plan.horseId,
});
```

Không publish event trước commit. Event handler không nên được dùng để thay thế
việc ghi dữ liệu bắt buộc trong transaction. Với Keycloak, email, S3 hoặc HTTP
external call, cân nhắc cơ chế retry/outbox nếu side effect cần đảm bảo không
bị mất.

## 10. Quy trình tạo feature mới

Ví dụ thêm `racing-results` vào module Racing:

1. Tạo entity, enum và migration nếu feature có bảng mới.
2. Tạo DTO input/output và mapper.
3. Tạo policy cho các chuyển trạng thái/invariant thuần.
4. Tạo `racing-results.repository.ts` nếu query có tính nghiệp vụ; nếu CRUD
   đơn giản thì inject `Repository<Entity>` trực tiếp.
5. Tạo service cho từng use case và thêm transaction khi cần.
6. Tạo controller mỏng với `@CurrentUser`, `@Access`, pipe và Swagger.
7. Tạo feature module với `forFeature`, providers, controllers, exports.
8. Import feature module vào `racing.module.ts`.
9. Nếu có access logic dùng chung, cập nhật `racing-shared.module.ts`.
10. Viết unit test cho policy/service và cập nhật API docs.

Khung module tối thiểu:

```ts
@Module({
  imports: [TypeOrmModule.forFeature([RacingResultEntity])],
  controllers: [RacingResultsController],
  providers: [RacingResultsService],
  exports: [RacingResultsService],
})
export class RacingResultsModule {}
```

Sau đó thêm module con vào module cha:

```ts
@Module({
  imports: [RacingResultsModule, RacesModule],
})
export class RacingModule {}
```

## 11. Checklist trước khi mở PR

- [ ] Feature nằm trong module con, module cha chỉ lắp ráp.
- [ ] Entity đã có migration tương ứng.
- [ ] DTO có `class-validator` và Swagger metadata.
- [ ] Response đi qua mapper, không trả entity trực tiếp.
- [ ] Controller không chứa query hoặc business rule.
- [ ] Access check được thực hiện bằng local user/resource ownership.
- [ ] Transaction dùng đúng `EntityManager` của callback.
- [ ] Row được lock trước khi kiểm tra invariant có race condition.
- [ ] Event chỉ publish sau commit.
- [ ] Repository chỉ chứa query có giá trị; CRUD đơn giản dùng
      `@InjectRepository` trực tiếp.
- [ ] Có unit test cho policy và các nhánh conflict/forbidden/not found.
- [ ] `pnpm build`, `pnpm test` và `pnpm docs:api` chạy thành công.

Khi PR thay đổi một aggregate domain, chạy thêm `pnpm check:module-architecture`.
Lệnh này kiểm tra composition root, đảm bảo module cha import các module con
và không nhận controller, provider hay đăng ký entity trực tiếp.

## 12. Tài liệu tham khảo trong codebase

- Module hoàn chỉnh: `src/modules/training/`
- Access dùng chung: `src/modules/training/shared/training-access.service.ts`
- Policy thuần: `src/modules/training/policies/training.policy.ts`
- Transaction và cascade update:
  `src/modules/training/training-plans/training-plans.service.ts`
- Query phức tạp gom trong repository:
  `src/modules/racing/repositories/racing.repository.ts`
- DTO và mapper: `src/modules/training/dto/`,
  `src/modules/training/mappers/`

## 13. Phạm vi kiểm tra tự động

`pnpm check:module-architecture` áp dụng các kiểm tra cấu trúc cho mọi domain
đã có feature module con: module cha phải lắp đủ feature, feature phải đăng ký
controller/service/repository của mình và không import trực tiếp feature sibling.
Domain mới có ít nhất 20 file TypeScript không phải test mà chưa có feature
module, hoặc có service vượt 1.000 dòng, sẽ bị kiểm tra báo lỗi cho đến khi
được tách theo use case.

`racing` là ngoại lệ chuyển đổi đã tồn tại: service hiện gom nhiều workflow
vào một file lớn. Cần tách domain này theo từng use case trong đợt refactor
riêng; ngoại lệ này được giữ trong script để không che giấu khoản chuyển đổi
còn lại và không cho phép thêm ngoại lệ tương tự.
