declare const Buffer: {
  from(value: ArrayBuffer | ArrayLike<number> | string, encoding?: string): {
    toString(encoding?: string): string;
  };
};
