import { Brackets } from "typeorm";
import { convertArrayOfStringIntoStringNumber } from "../utils/functions";
import { FILTER_OPERATION_PREFIX } from "./constants";
import { GraphqlFilterFieldMetadata } from "./decorators/field.decorator";
import { IFilterDecoratorParams } from "./decorators/resolver.decorator";
import { IFilter, OperationQuery } from "./input-type-generator";

export enum EOperationType {
  AND,
  OR
}

export const convertFilterParameters = <T>(parameters?: IFilter<T>[], opType: EOperationType = EOperationType.AND, customFields?: Map<string, GraphqlFilterFieldMetadata>, options?: IFilterDecoratorParams) => {
  // For tests purposes and GlobalPipes like ValidationPipe that uses class-transformer to transform object to the class. 
  // If you provide Brackets instead of object to the decorator, it will use your brackets without processing it.
  if ((parameters as any)?.whereFactory) return parameters;

  return new Brackets((qb) => {
    if (parameters == null) {
      return;
    }

    for (const op of parameters) {
      if (op.and) {
        const innerBrackets = convertFilterParameters<T>(op.and, EOperationType.AND, customFields, options);
        if (innerBrackets instanceof Brackets) {
          qb.andWhere(innerBrackets)
        }
      }

      if (op.or) {
        const innerBrackets = convertFilterParameters<T>(op.or, EOperationType.OR, customFields, options);
        if (innerBrackets instanceof Brackets) {
          qb.orWhere(innerBrackets)
        }
      }


      const clonnedOp = {...op};
  
      delete clonnedOp.and;
      delete clonnedOp.or;

      const basicParameters = recursivelyTransformComparators(clonnedOp, customFields, options?.sqlAlias);
      if (basicParameters) {
        for (const query of basicParameters) {
          if (opType === EOperationType.AND) {
            qb.andWhere(query[0], query[1]);
          } else {
            qb.orWhere(query[0], query[1]);
          }
        }
      }
      
    }
  });
}

const recursivelyTransformComparators = (object: Record<string, any>, extendedParams?: Map<string, GraphqlFilterFieldMetadata>, sqlAlias?: string) => {
  if (!object || !Object.entries(object).length) return null;
  const typeormWhereQuery = [];
  for (const [key, value] of Object.entries(object)) {
    if (typeof value === "object") {
      const operators = Object.entries(
        value as Record<string, any>
      );
      if (operators.length > 1) {
        throw new Error('Inside filter statement should be only one condition operator for each attribute');
      }
      for (const [innerKey, innerValue] of operators) {
        const operatorKey = innerKey.replace(FILTER_OPERATION_PREFIX, '');
        if (extendedParams.has(key)) {
          const field = extendedParams.get(key);
          const rightExpression = field.sqlExp ? field.sqlExp : (sqlAlias ? `${sqlAlias}.${field.name}` : field.name);
          typeormWhereQuery.push(buildSqlArgument(operatorKey, rightExpression, innerValue));
        } else {
          const rightExpression = sqlAlias ? `${sqlAlias}.${key}` : key;
          typeormWhereQuery.push(buildSqlArgument(operatorKey, rightExpression, innerValue));
        }
      }
    }
  }
  return typeormWhereQuery;
}

const buildSqlArgument = (operatorKey: string, field: string, value: any) => {
  let result = [];
  const argName = `arg_${convertArrayOfStringIntoStringNumber([field])}_${Math.floor(Math.random() * 1e6)}`
  if (operatorKey === OperationQuery.eq) {
    if (value === null || value === 'null') {
      result = [`${field} is null`];
    } else {
      result = [`${field} = :${argName}`, { [argName]: value }];
    }
  } else if (operatorKey === OperationQuery.neq) {
    if (value === null || value === 'null') {   
      result = [`${field} != :${argName}`, { [argName]: value }];
    } else {
      result = [`${field} is not null`];
    }
  } else if (operatorKey === OperationQuery.lt) {
    result = [`${field} < :${argName}`, { [argName]: value }];
  } else if (operatorKey === OperationQuery.lte) {
    result = [`${field} <= :${argName}`, { [argName]: value }];
  } else if (operatorKey === OperationQuery.gt) {
    result = [`${field} > :${argName}`, { [argName]: value }];
  } else if (operatorKey === OperationQuery.gte) {
    result = [`${field} >= :${argName}`, { [argName]: value }];
  } else if (operatorKey === OperationQuery.like) {
    result = [`${field}::varchar ilike :${argName}::varchar`, { [argName]: value }];
  } else if (operatorKey === OperationQuery.notlike) {
    result = [`${field}::varchar not ilike :${argName}::varchar`, { [argName]: value }];
  } else if (operatorKey === OperationQuery.between) {
    result = [`${field} between :${argName}1 and :${argName}2`, { [`${argName}1`]: value[0], [`${argName}2`]: value[1] }];
  } else if (operatorKey === OperationQuery.notbetween) {
    result = [`${field} not between :${argName}1 and :${argName}2`, { [`${argName}1`]: value[0], [`${argName}2`]: value[1] }];
  } else if (operatorKey === OperationQuery.in) {
    result = [`${field} in (:...${argName})`, { [argName]: value }];
  } else if (operatorKey === OperationQuery.notin) {
    result = [`${field} not in (:...${argName})`, { [argName]: value }];
  } else if (operatorKey === "any") {
    result = [`${field} any (:${argName})`, { [argName]: value }];
  } else if (operatorKey === OperationQuery.null) {
    if (value === 'true' || value === true) {
      result = [`${field} is null`];
    } else {
      result = [`${field} is not null`];
    }
  }

  return result;
}