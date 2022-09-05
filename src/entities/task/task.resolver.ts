// import { Filter } from '@nestjs-query/core';
import { Query, ResolveField, Resolver } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { Filter, GraphqlFilter, GraphqlLoader, GraphqlSorting, Loader, LoaderData, Paginator, PaginatorArgs, SelectedFields, SelectedFieldsResult, SortArgs, Sorting } from '../../../lib';
import { UserObjectType } from '../user/user.dto';
import { User } from '../user/user.entity';
import { TaskObjectType } from './task.dto';
import { Task } from './task.entity';

@Resolver(() => TaskObjectType)
export class TaskResolver {

  constructor(
    @InjectRepository(Task) public readonly taskRepository: Repository<Task>,
    @InjectRepository(User) public readonly userRepository: Repository<User>
  ) {}

  @Query(() => [TaskObjectType])
  @GraphqlFilter()
  @GraphqlSorting()
  async tasks(
   @Filter(() => TaskObjectType) filter: Brackets,
   @SelectedFields({sqlAlias: 't'}) selectedFields: SelectedFieldsResult,
   @Paginator() paginator: PaginatorArgs,
   @Sorting(() => TaskObjectType) sorting: SortArgs<TaskObjectType>
  ) {
    const qb = this.taskRepository.createQueryBuilder('t')
      .select(selectedFields.fieldsData.fieldsString)
      .where(filter)
    
    if (paginator) {
      qb.offset(paginator.page).limit(paginator.per_page)
    }
    
    if (sorting) {
      qb.orderBy(sorting);
    }
    return qb.getMany();
  }

  @ResolveField(() => UserObjectType, {nullable: true})
  @GraphqlLoader({
    foreignKey: 'assignee_id'
  })
  async assignee(
    @Loader() loader: LoaderData<TaskObjectType, number>,
    @Filter(() => UserObjectType) filter: Brackets,
  ) {
    const qb = this.userRepository.createQueryBuilder('u')
      .where(filter)
      .andWhere({
        id: In(loader.ids)
      })
    const users = await qb.getMany();
    return loader.helpers.mapManyToOneRelation(users, loader.ids);
  }
}
