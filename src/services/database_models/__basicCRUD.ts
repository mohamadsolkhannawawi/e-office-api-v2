/** biome-ignore-all lint/suspicious/noExplicitAny: common options for prisma, anyone know how to properly type it? */
export function CRUD<
	TModel,
	TDelegate extends {
		findMany: (options: any) => Promise<TModel[]>;
		findFirst: (options: any) => Promise<TModel | null>;
		count: (options: any) => Promise<number>;
		delete: (options: any) => Promise<TModel>;
	},
	TCommonIncludes extends Record<string, boolean | Record<string, any>> = {},
>(delegate: TDelegate, commonIncludes?: TCommonIncludes) {
	type CommonOptions = {
		where?: any;
		orderBy?: any;
		skip?: number;
		take?: number;
		select?: any;
		include?: TCommonIncludes;
	};

	abstract class CRUD {
		private static delegate: TDelegate = delegate;

		private static commonIncludes = commonIncludes;

		private static mergeOptions(options: CommonOptions): CommonOptions {
			if (!CRUD.commonIncludes) {
				return options;
			}

			const mergedOptions: CommonOptions = {
				...options,
				include: {
					...CRUD.commonIncludes,
					...options.include,
				},
			};

			return mergedOptions;
		}

		public static async getMany(
			options: CommonOptions = {},
		): Promise<TModel[]> {
			const mergedOptions = CRUD.mergeOptions(options);
			return await CRUD.delegate.findMany(mergedOptions);
		}

		public static async getAll(): Promise<TModel[]> {
			return await CRUD.getMany({});
		}

		public static async get(
			id: string,
			options: CommonOptions = {},
		): Promise<TModel | null> {
			const mergedOptions = CRUD.mergeOptions({
				...options,
				where: { id },
			});
			return await CRUD.delegate.findFirst(mergedOptions);
		}

		public static async delete(id: string): Promise<TModel> {
			return await CRUD.delegate.delete({ where: { id } });
		}
		public static async count(options?: CommonOptions): Promise<number> {
			return await CRUD.delegate.count(options);
		}
	}

	return CRUD;
}
