# Runnable：把写逻辑变成组织 chain

通过 runnable 把 promptTemplate、model、output 整条链路组装起来，不用写调用逻辑

通过 Runnable api，可以声明式的组合执行的 chain，然后统一执行，这种声明式写法就做 **LCEL**：Lang Chain Expression Language，LangChain 表达式语言
