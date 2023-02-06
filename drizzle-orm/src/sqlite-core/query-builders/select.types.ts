import { GetColumnConfig, GetColumnData } from '~/column';
import { Placeholder, SQL, SQLResponse } from '~/sql';
import { Equal, Simplify } from '~/utils';

import { AnySQLiteColumn } from '~/sqlite-core/columns';
import { ChangeColumnTableName } from '~/sqlite-core/columns/common';
import {
	AnySQLiteTable,
	GetTableConfig,
	SQLiteTableWithColumns,
	TableConfig,
	UpdateTableConfig,
} from '~/sqlite-core/table';

import { SelectFields as SelectFieldsBase, SelectFieldsOrdered as SelectFieldsOrderedBase } from '~/operations';
import { SQLiteSelect } from './select';

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export type SelectMode = 'partial' | 'single' | 'multiple';

export interface JoinsValue {
	on: SQL;
	table: AnySQLiteTable;
	joinType: JoinType;
}

export type JoinNullability = 'nullable' | 'null' | 'not-null';

export type ApplyNullability<T, TNullability extends JoinNullability> = TNullability extends 'nullable' ? T | null
	: TNullability extends 'null' ? null
	: T;

export type ApplyNotNullMapToJoins<TResult, TNullabilityMap extends Record<string, JoinNullability>> = {
	[TTableName in keyof TResult & keyof TNullabilityMap & string]: ApplyNullability<
		TResult[TTableName],
		TNullabilityMap[TTableName]
	>;
};

export type SelectResult<
	TResult,
	TSelectMode extends SelectMode,
	TJoinsNotNullable extends Record<string, JoinNullability>,
> = TSelectMode extends 'partial' ? SelectPartialResult<TResult, TJoinsNotNullable>
	: TSelectMode extends 'single' ? TResult
	: Simplify<ApplyNotNullMapToJoins<TResult, TJoinsNotNullable>>;

type IsUnion<T, U extends T = T> = (T extends any ? (U extends T ? false : true)
	: never) extends false ? false : true;

type Not<T extends boolean> = T extends true ? false : true;

type SelectPartialResult<TFields, TNullability extends Record<string, JoinNullability>> = TNullability extends
	TNullability ? {
		[Key in keyof TFields]: TFields[Key] extends infer TField
			? TField extends AnySQLiteTable ? GetTableConfig<TField, 'name'> extends keyof TNullability ? ApplyNullability<
						SelectResultFields<GetTableConfig<TField, 'columns'>>,
						TNullability[GetTableConfig<TField, 'name'>]
					>
				: never
			: TField extends AnySQLiteColumn
				? GetColumnConfig<TField, 'tableName'> extends infer TTableName extends keyof TNullability
					? ApplyNullability<SelectResultField<TField>, TNullability[TTableName]>
				: never
			: TField extends SQL | SQLResponse ? SelectResultField<TField>
			: TField extends Record<string, any>
				? TField[keyof TField] extends
					AnySQLiteColumn<{ tableName: infer TTableName extends string }> | SQL | SQLResponse
					? Not<IsUnion<TTableName>> extends true
						? ApplyNullability<SelectResultFields<TField>, TNullability[TTableName]>
					: SelectPartialResult<TField, TNullability>
				: never
			: never
			: never;
	}
	: never;

export type AnySQLiteSelect = SQLiteSelect<any, any, any, any, any, any>;

export type BuildAliasTable<TTable extends AnySQLiteTable, TAlias extends string> = GetTableConfig<TTable> extends
	infer TConfig extends TableConfig ? SQLiteTableWithColumns<
		UpdateTableConfig<TConfig, {
			name: TAlias;
			columns: Simplify<MapColumnsToTableAlias<TConfig['columns'], TAlias>>;
		}>
	>
	: never;

export type MapColumnsToTableAlias<TColumns extends Record<string, AnySQLiteColumn>, TAlias extends string> = {
	[Key in keyof TColumns]: ChangeColumnTableName<TColumns[Key], TAlias>;
};

export type AppendToResult<
	TTableName extends AnySQLiteTable,
	TResult,
	TJoinedName extends string,
	TSelectedFields extends SelectFields,
	TOldSelectMode extends SelectMode,
> = TOldSelectMode extends 'partial' ? TResult
	: TOldSelectMode extends 'single'
		? Record<GetTableConfig<TTableName, 'name'>, TResult> & Record<TJoinedName, SelectResultFields<TSelectedFields>>
	: Simplify<TResult & Record<TJoinedName, SelectResultFields<TSelectedFields>>>;

type SetJoinsNullability<TNullabilityMap extends Record<string, JoinNullability>, TValue extends JoinNullability> = {
	[Key in keyof TNullabilityMap]: TValue;
};

export type AppendToJoinsNotNull<
	TJoinsNotNull extends Record<string, JoinNullability>,
	TJoinedName extends string,
	TJoinType extends JoinType,
> = 'left' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'nullable' }
	: 'right' extends TJoinType ? SetJoinsNullability<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'not-null' }
	: 'inner' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'not-null' }
	: 'full' extends TJoinType ? SetJoinsNullability<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'nullable' }
	: never;

export interface SQLiteSelectConfig {
	fields: SelectFieldsOrdered;
	where?: SQL | undefined;
	table: AnySQLiteTable;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: Record<string, JoinsValue>;
	orderBy: SQL[];
	groupBy: (AnySQLiteColumn | SQL)[];
}

export type JoinFn<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TResult,
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> = <
	TJoinedTable extends AnySQLiteTable,
	TJoinedName extends GetTableConfig<TJoinedTable, 'name'> = GetTableConfig<TJoinedTable, 'name'>,
>(table: TJoinedTable, on: SQL) => SQLiteSelect<
	TTable,
	TResultType,
	TRunResult,
	AppendToResult<TTable, TResult, TJoinedName, GetTableConfig<TJoinedTable, 'columns'>, TSelectMode>,
	TSelectMode extends 'partial' ? TSelectMode : 'multiple',
	AppendToJoinsNotNull<TJoinsNotNullable, TJoinedName, TJoinType>
>;

export type SelectFields = SelectFieldsBase<AnySQLiteColumn, AnySQLiteTable>;

export type SelectFieldsOrdered = SelectFieldsOrderedBase<AnySQLiteColumn>;

export type SelectResultField<T> = T extends AnySQLiteTable ? SelectResultField<GetTableConfig<T, 'columns'>>
	: T extends AnySQLiteColumn ? GetColumnData<T>
	: T extends SQLResponse<infer TDriverParam> ? TDriverParam
	: T extends SQL ? unknown
	: T extends Record<string, any> ? { [Key in keyof T]: SelectResultField<T[Key]> }
	: never;

export type SelectResultFields<TSelectedFields extends SelectFields> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: SelectResultField<TSelectedFields[Key]>;
	}
>;