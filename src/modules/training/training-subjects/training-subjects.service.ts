import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { mapAnyUniqueViolation } from '../../../common/utils/unique-violation';
import {
  CreateTrainingSubjectDto,
  TrainingSubjectResponseDto,
  UpdateTrainingSubjectDto,
} from '../dto/training-subject.dto';
import { TrainingSubjectEntity } from '../entities/training-subject.entity';
import { toTrainingSubjectResponse } from '../mappers/training-subject.mapper';
import { assertSubjectExercise } from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';

const SUBJECT_NAME_TAKEN = 'Tên môn học đã tồn tại';
const SUBJECT_NOT_FOUND = 'Không tìm thấy môn học';

/**
 * Danh mục môn học dùng chung toàn CLB: mỗi môn là một bài tập cố định
 */
@Injectable()
export class TrainingSubjectsService {
  constructor(
    @InjectRepository(TrainingSubjectEntity)
    private readonly subjects: Repository<TrainingSubjectEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Liệt kê mọi môn học theo tên
   *
   * @returns Promise trả về các môn học, sắp theo tên tăng dần
   */
  async list(): Promise<TrainingSubjectResponseDto[]> {
    const rows = await this.subjects.find({ order: { name: 'ASC' } });
    return rows.map(toTrainingSubjectResponse);
  }

  /**
   * Lấy một môn học
   *
   * @param subjectId UUID của môn học
   * @returns Promise trả về môn học
   * @throws NotFoundException Nếu không có môn học
   */
  async get(subjectId: string): Promise<TrainingSubjectResponseDto> {
    const row = await this.subjects.findOneBy({ id: subjectId });
    if (!row) throw new NotFoundException(SUBJECT_NOT_FOUND);
    return toTrainingSubjectResponse(row);
  }

  /**
   * Thêm môn học mới
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Nội dung bài tập của môn
   * @returns Promise trả về môn học vừa tạo
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws BadRequestException Nếu môn chạy thử có cự ly 0, hoặc môn thường có thời gian mục tiêu
   * @throws ConflictException Nếu tên môn đã tồn tại
   */
  async create(
    actor: Actor,
    body: CreateTrainingSubjectDto,
  ): Promise<TrainingSubjectResponseDto> {
    await this.access.currentUser(actor);
    const targetTimeMs = body.targetTimeMs ?? null;
    assertSubjectExercise(
      body.sessionType,
      body.plannedDistanceM,
      targetTimeMs,
    );
    const saved = await mapAnyUniqueViolation(
      () =>
        this.subjects.save(
          this.subjects.create({
            name: body.name.trim(),
            description: body.description ?? null,
            sessionType: body.sessionType,
            intensity: body.intensity,
            plannedDistanceM: body.plannedDistanceM,
            surface: body.surface ?? null,
            targetTimeMs,
          }),
        ),
      SUBJECT_NAME_TAKEN,
    );
    return toTrainingSubjectResponse(saved);
  }

  /**
   * Sửa môn học; các buổi tập đã tạo từ môn này giữ nguyên
   *
   * - Field không gửi giữ giá trị cũ; gửi targetTimeMs null để xóa thời gian mục tiêu
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param subjectId UUID của môn học
   * @param body Các field cần sửa
   * @returns Promise trả về môn học sau khi sửa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có môn học
   * @throws BadRequestException Nếu môn chạy thử có cự ly 0, hoặc môn thường có thời gian mục tiêu
   * @throws ConflictException Nếu tên môn đã tồn tại
   */
  async update(
    actor: Actor,
    subjectId: string,
    body: UpdateTrainingSubjectDto,
  ): Promise<TrainingSubjectResponseDto> {
    await this.access.currentUser(actor);
    const saved = await mapAnyUniqueViolation(
      () =>
        this.dataSource.transaction(async (manager) => {
          const row = await manager.findOne(TrainingSubjectEntity, {
            where: { id: subjectId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!row) throw new NotFoundException(SUBJECT_NOT_FOUND);
          Object.assign(row, {
            name: body.name?.trim() ?? row.name,
            description:
              body.description === undefined
                ? row.description
                : body.description,
            sessionType: body.sessionType ?? row.sessionType,
            intensity: body.intensity ?? row.intensity,
            plannedDistanceM: body.plannedDistanceM ?? row.plannedDistanceM,
            surface: body.surface === undefined ? row.surface : body.surface,
            targetTimeMs:
              body.targetTimeMs === undefined
                ? row.targetTimeMs
                : body.targetTimeMs,
          });
          assertSubjectExercise(
            row.sessionType,
            row.plannedDistanceM,
            row.targetTimeMs,
          );
          return manager.save(row);
        }),
      SUBJECT_NAME_TAKEN,
    );
    return toTrainingSubjectResponse(saved);
  }

  /**
   * Xóa môn học
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param subjectId UUID của môn học
   * @returns Promise hoàn tất khi đã xóa
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có môn học
   */
  async remove(actor: Actor, subjectId: string): Promise<void> {
    await this.access.currentUser(actor);
    const result = await this.subjects.delete({ id: subjectId });
    if (!result.affected) throw new NotFoundException(SUBJECT_NOT_FOUND);
  }
}
