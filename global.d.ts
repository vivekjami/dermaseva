// Metro bundler returns a numeric module ID for static asset requires
declare module '*.txt' {
  const moduleId: number;
  export default moduleId;
}
