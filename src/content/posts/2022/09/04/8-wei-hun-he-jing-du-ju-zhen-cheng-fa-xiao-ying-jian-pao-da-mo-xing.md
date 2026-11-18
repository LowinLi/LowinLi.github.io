---
title: "8位混合精度矩阵乘法，小硬件跑大模型"
date: 2022-09-04
updated: 2022-09-04
tags: ["NLP", "transformers", "Quantization", "GPT", "GPU"]
categories: ["技术"]
description: "NLP语言模型一直在变大，如今，PaLM有5400亿个参数，OPT、GPT3、BLOOM 有1760亿个参数，未来参数量还回更大，下面是如今"
shelf: infer
oldUrl: "/2022/09/04/8-wei-hun-he-jing-du-ju-zhen-cheng-fa-xiao-ying-jian-pao-da-mo-xing/"
---

-   原论文：[https://arxiv.org/pdf/2208.07339.pdf](https://arxiv.org/pdf/2208.07339.pdf)
-   原博客：[https://huggingface.co/blog/hf-bitsandbytes-integration](https://huggingface.co/blog/hf-bitsandbytes-integration)

## 背景

NLP语言模型一直在变大，如今，**PaLM**有5400亿个参数，**OPT**、**GPT-3**、**BLOOM** 有1760亿个参数，未来参数量还回更大，下面是如今大模型的参数量比较：

![](/posts-media/8-wei-hun-he-jing-du-ju-zhen-cheng-fa-xiao-ying-jian-pao-da-mo-xing/LLM3.webp)

因此，这些模型很难在普通的设备上运行。比如，只是推断**BLOOM-176B**就需要**8块 80GB的A100显卡**，每块约1万5美元。而如果微调**BLOOM-176B**，就需要**72块**这样的显卡。如果是**PaLM**就需要更多计算资源了。

因为这些大模型需要太多显卡，我们需要想办法在保持模型表现前提下，降低计算资源需求。有些技术通过削减模型尺寸达到了这个目的，如量化、蒸馏等等。

在完成**BLOOM-176B**模型训练后，我们在**HuggingFace**和**BigScience**中，想办法让这个大模型在更少的显卡上运行。通过**BigScience**社区，我们发现Int8推断不会降低大模型的预测表现，而内存使用降低了两倍。接着我们开始研究把它全部集成进transformers库。在发布这篇博客时，我们推出了LLM.int8()量化方法，集成了所有HuggingFace模型，如果感兴趣可以阅读我们的论文[LLM.int8(): 8-bit Matrix Multiplication for Transformers at Scale](https://arxiv.org/abs/2208.07339)。

在这篇博客中，我们回顾了量化技术，列出了使用transformers库做量化的难点，以及长期规划。

这里我们会介绍是什么让大模型用了这么多内存（350GB）？下面我们逐步开始把。

## 机器学习使用的常规数据类型

我们从不同的浮点数数据类型开始，它经常被叫做**参数精度**(precision)。

模型的内存需求要考虑两点，模型参数量、参数精度。一般参数精度有`float32`、`float16`、`bfloat16`三种，如下图[https://blogs.nvidia.com/blog/2020/05/14/tensorfloat-32-precision-format/](https://blogs.nvidia.com/blog/2020/05/14/tensorfloat-32-precision-format/)

![](/posts-media/8-wei-hun-he-jing-du-ju-zhen-cheng-fa-xiao-ying-jian-pao-da-mo-xing/tf32-Mantissa-chart-hi-res-FINAL.png)

Float32(FP32)表示标准**IEEE 32-bit floating point**，这个数据类型代表了范围较宽的浮点数字。在FP32中，8位表示幂数，23位表示系数，1位表示正负符号。大多数硬件都支持FP32。

对于float16(FP16)数据类型，5位表示幂数，10位表示系数。那么FP16浮点数的数值范围比FP32要小。这就会增加FP16浮点数的数值溢出风险（overflowing：表示的数值太大超出范围、underflowing：表示的数值太小超出范围）

例如，当做一个10k \* 10k的操作，期望得到100k时，就不能在FP16中表示，因为它表示最大的数字是64k，那么我们会得到NaN(Not a Number)。如果是在神经网络中计算出现NaN，那么先前的工作就全毁了。一般情况下，**loss scaling**技术会帮助克服这个问题，但它也不是总有效。

bfloat16(BF16)是一种新数据格式，用来避免上面的问题。在BF16中，8位表示幂数（与FP32一样），7位表示系数，

这意味着，BF16可以达到与FP32一样的数值范围，但是损失了3位的精度。

在NVIDIA的Ampere架构中引入了[TensorFloat-32](https://blogs.nvidia.com/blog/2020/05/14/tensorfloat-32-precision-format/) (TF32)数据格式，结合了BF16的数值范围和FP16的精度范围，总共用19位。但它只在一些特定操作中使用。

在机器学习的术语中，FP32叫做全精度(4 bytes), BF16、FP16叫做半精度(2 bytes)。在这基础上，int8(INT8)数据类型包含8位表示，只能存储2^8个不同的数字(\[0,255\]的整数，或\[-128,127\]的整数)

最理想精度的训练和推断都应该用FP32，但它会比FP16/BF16慢两倍，因此有了混合精度技术。在模型权重部分使用FP32精度，同时计算模型前向传播和反向传播时，使用FP16/BF16精度，从而提高训练速度。FP16/BF16的梯度用来更新FP32的模型权重。

在训练中，模型权重存为FP32；但是在推断中，半精度模型权重也经常可以提供相近的推断表现。因此FP32精度计算只是在梯度更新时很有必要。这意味着我们在模型推断时使用半精度模型权重，就可以节省一半的显卡。

![](/posts-media/8-wei-hun-he-jing-du-ju-zhen-cheng-fa-xiao-ying-jian-pao-da-mo-xing/Model-storage.png)

为了计算模型的内存使用量，我们需要做模型参数量和模型精度的乘法。例如，我们计算bfloat16版本的BLOOM-176B模型，176\*10^9 \* 2bytes = 352GB，这仍然很难在几块显卡上运行。

如果我们能够把模型权重存储为其他的数据格式呢？例如量化技术，它已被广泛用于深度学习中。

## 模型量化介绍

我们在实验中发现，使用2-bytes的半精度(BF16/FP16)与4-bytes的FP32全精度可以得到几乎一致的推断输出，而半精度的模型，内存使用量降了一半。但是如果继续降低精度，就会发现推断结果表现迅速下降。

为了修复这个问题，我们引入了8-bits量化技术，这个方法使用了1/4的精度，因此只需要1/4的模型尺寸，但这并不只是再降低一半精度那么简单。

量化是把一种数据类型近似转换为另一种数据类型的方法。例如，一种数据类型的数值范围是0-9的整数，另一种是0-4的整数，对于第一种数据类型的数值4，近似第二种数据类型的2，而第一种数据类型的数值3，近似第二种数据类型的1至2之间，我们通常把它近似为2。那么第一种数据类型的数值4和3，近似第二种数据类型的数值都为2，这就造成量化噪音，导致信息损失（一种压缩损失）。

有两种8-bits量化技术最常见，分别是**zero-point quantization**和**absolute maximum (absmax) quantization**，他们都是把浮点数值压缩至int8（1 byte）格式。首先，他们都会通过量化因子把输入标准化。

例如，在**zero-point quantization**中，如果我们的量化前数值取值范围是-1.0到1.0，想要量化到-127到127之间，通过量化因子127，将其近似到8-bit精度。如果要恢复原始值，就把int8的数值除以量化因子得到原始值。例如，数值0.3在量化过程，近似为0.3\*127=38.1，然后四舍五入近似到整数38，如果要恢复原始值，就通过38/127=0.2992得到。那么我们有了0.008的量化误差。这些细微的误差会在深度神经网络模型的多层前向传播中慢慢累积，导致最终的输出表现下降。

![](/posts-media/8-wei-hun-he-jing-du-ju-zhen-cheng-fa-xiao-ying-jian-pao-da-mo-xing/quantization.png)

[上图出处](https://intellabs.github.io/distiller/algo_quantization.html)

下面是**absmax quantization**技术，为了将fp16的数值全部转换到int8的取值范围内，必须要先找到所有网络中的绝对最大值，然后得到乘数，乘到所有数值中。

例如，假设我们要使用**absmax quantization**技术对向量`[1.2, -0.5, -4.3, 1.2, -3.1, 0.8, 2.4, 5.4]`进行量化。首先找到绝对值最大值`5.4`。Int8的取值范围是`[-127, 127]`，所以量化因子为127/5.4=23.5。因此向量会被量化成`[28, -12, -101, 28, -73, 19, 56, 127]`。

![](/posts-media/8-wei-hun-he-jing-du-ju-zhen-cheng-fa-xiao-ying-jian-pao-da-mo-xing/out-quant.gif)

接着为了恢复原始值至全精度，只需要除以量化因子，但它们在量化过程近似取整过的，所以会有量化损失。

![](/posts-media/8-wei-hun-he-jing-du-ju-zhen-cheng-fa-xiao-ying-jian-pao-da-mo-xing/quant-freeze.webp)

为了不区分正负符号的int8格式，我们需要减去最小值，然后再使用绝对最大值做量化因子。这和**zero-point quantization**有点像，但不同的是，**zero-point quantization**会把全精度的数值0，依然转换为整数0，在数值0处保证不会有量化损失。

这类技巧可以由多种方式结合，例如当做矩阵乘法时，**row-wise**量化或**vector-wise**量化可以获得更准确的结果。当我们做矩阵乘法`A*B=C`时，可以不用统一的量化转化，而是每个矩阵单独找到最大值做量化因子量化。**vector-wise**量化的方式是找到矩阵A的每一行和矩阵B的对应列的绝对最大值，然后通过127与最大值的除数作为量化因子量化得到新的向量，接着通过矩阵乘法得到矩阵C，最终我们再计算矩阵A、B的绝对最大值的的外积，来恢复FP16精度数值。详细可见论文 [LLM.int8() paper](https://arxiv.org/abs/2208.07339)，或博客 [blog post about quantization and emergent features](https://timdettmers.com/2022/08/17/llm-int8-and-emergent-features/)。

这些技术虽然让我们可以对深度神经网络模型进行量化，但是一般在更大参数量的模型上，会带来明显的准确率的下降。然而，已经集成在Hugging Face Transformers库和Accelerate库的\*\*LLM.int8()\*\*量化方法，不会在大模型上导致表现下降，例如1760亿参数量的BLOOM。

## LLM.int8(): 大模型的零退化矩阵乘法量化技术

在本节，为了理解为什么传统量化技术在大模型上表现很差，我们必须先理解模型的量化尺度属性（scale-dependent emergent properties）。在下一节我们会证明outlier features导致的表现退化，而下面我们先介绍\*\*LLM.int8()\*\*算法

首先最重要的是，`LLM.int8()`会通过以下三步完成矩阵乘法：

1.  从矩阵隐藏层中，以列为单位，抽取outliers（值大于确定阈值的）。
2.  分别通过FP16精度对outliers的部分做矩阵乘法，通过量化int8精度对其他的做矩阵乘法。
3.  将量化的部分恢复成FP16，然后将两部分合在一起。

这三步如下动图所示：  
![](/posts-media/8-wei-hun-he-jing-du-ju-zhen-cheng-fa-xiao-ying-jian-pao-da-mo-xing/Mixed-int8.gif)

### outlier features的重要性

数值超出全局阈值范围的，被称为outliers，outliers的检测已经被广泛使用了，如果提前知道特征的分布，也可以帮助outlier的检测。更有趣的是，我们发现一般的量化会在基于transformer的模型，参数量超过60亿时表现失效。而小些的模型也会存在outlier的特征，我们发现outlier会均匀的分布在transformers模型中的每一层结构中。更详细的现象可以参见[论文](https://arxiv.org/abs/2208.07339)和[博客](https://timdettmers.com/2022/08/17/llm-int8-and-emergent-features/)。

就像刚刚提到的，8位精度的数据是压缩的，因此量化一个含几个大数值的向量会导致大量错误的结果。进而，因为transformer架构的模型会把所有的内置特征连接组合在一起，那么这些错误就会在多层网络的传播中，逐步混合在一起。因此，混合精度量化技术出现了，它会把大数值的特征拆分出来做更有效的量化混合精度计算。

### 矩阵乘法内部

一旦某层的隐藏层的值都被计算出来，我们就可以通过阈值抽取outlier，然后把矩阵分成两部分。我们发现只要阈值是6或更大，就可以得到无损的推断结果。outlier的部分是通过传统的fp16精度计算得来的，同时其他的部分是通过vector-wise 量化的8位精度矩阵，做向量乘法得到的。最后，再将量化的部分恢复成半精度矩阵，与outlier部分合在一起。

![](/posts-media/8-wei-hun-he-jing-du-ju-zhen-cheng-fa-xiao-ying-jian-pao-da-mo-xing/Matmul.webp)

### 零退化意味着什么

我们如何正确评估量化损失？在8位量化过程中损失了多少信息呢？

下面报告了，8位量化模型和原模型比较的在lm-eval-harness任务上的几个基准

OPT-175B

| benchmarks | \- | \- | \- | \- | difference-value |
| --- | --- | --- | --- | --- | --- |
| name | metric | value - int8 | value - bf16 | std err - bf16 | \- |
| hellaswag | acc\_norm | 0.7849 | 0.7849 | 0.0041 | 0 |
| hellaswag | acc | 0.5921 | 0.5931 | 0.0049 | 0.001 |
| piqa | acc | 0.7965 | 0.7959 | 0.0094 | 0.0006 |
| piqa | acc\_norm | 0.8101 | 0.8107 | 0.0091 | 0.0006 |
| lambada | ppl | 3.0142 | 3.0152 | 0.0552 | 0.001 |
| lambada | acc | 0.7464 | 0.7466 | 0.0061 | 0.0002 |
| winogrande | acc | 0.7174 | 0.7245 | 0.0125 | 0.0071 |

BLOOM-176B

| benchmarks | \- | \- | \- | \- | difference - value |
| --- | --- | --- | --- | --- | --- |
| name | metric | value - int8 | value - bf16 | std err - bf16 | \- |
| hellaswag | acc\_norm | 0.7274 | 0.7303 | 0.0044 | 0.0029 |
| hellaswag | acc | 0.5563 | 0.5584 | 0.005 | 0.0021 |
| piqa | acc | 0.7835 | 0.7884 | 0.0095 | 0.0049 |
| piqa | acc\_norm | 0.7922 | 0.7911 | 0.0095 | 0.0011 |
| lambada | ppl | 3.9191 | 3.931 | 0.0846 | 0.0119 |
| lambada | acc | 0.6808 | 0.6718 | 0.0065 | 0.009 |
| winogrande | acc | 0.7048 | 0.7048 | 0.0128 | 0 |

因为绝对误差低于标准差，所以量化没有导致性能退化。（除了BLOOM-int8的表现反而比原模型更好）。评估表现详细细节可以看[论文](https://arxiv.org/abs/2208.07339)

### 速度更快吗

`LLM.int8()`的主要目标是让大模型在表现不退化的情况下更易用，需要的内存资源更低，但这方法似乎导致运行更慢了。因此我们又测试了多个模型的生成速度。我们发现BLOOM-176B模型在`LLM.int8()`技术中，比fp16精度的模型速度慢了15%到23%，这似乎还可以接受。但我们发现对于小些的模型，如`T5-3B`和`T5-11B`，`LLM.int8()`技术的计算大幅变慢。我们已经尝试了很多方法提高小模型的计算速度，如今，我们可以将`T5-3B`模型推断每个词的时间，从312ms提高至173ms，将`T5-11B`模型推断每个词的时间，从45ms提高至25ms。另外，一些[Issue](https://github.com/TimDettmers/bitsandbytes/issues/6#issuecomment-1211345635)也被提出了，在马上到来的下一个版本，`LLM.int8()`会在小模型上跑的更快。而现在，一些实验记录请见下表。

| Precision | Number of parameters | Hardware | Time per token in milliseconds for Batch Size 1 | Time per token in milliseconds for Batch Size 8 | Time per token in milliseconds for Batch Size 32 |
| --- | --- | --- | --- | --- | --- |
| bf16 | 176B | 8xA100 80GB | 239 | 32 | 9.9 |
| int8 | 176B | 4xA100 80GB | 282 | 37.5 | 10.2 |
| bf16 | 176B | 14xA100 40GB | 285 | 36.5 | 10.4 |
| int8 | 176B | 5xA100 40GB | 367 | 46.4 | oom |
| fp16 | 11B | 2xT4 15GB | 11.7 | 1.7 | 0.5 |
| int8 | 11B | 1xT4 15GB | 43.5 | 5.3 | 1.3 |
| fp32 | 3B | 2xT4 15GB | 45 | 7.2 | 3.1 |
| int8 | 3B | 1xT4 15GB | 312 | 39.1 | 10.2 |

三个模型是`BLOOM-176B`, `T5-11B`, `T5-3B`.

### transformers库 集成 nuances库

接下来介绍的是在`transformers`库集成的功能，如何使用和可能遇到的一般问题。

#### 使用

上面介绍的功能在`transformers`库中的模块名为`Linear8bitLt`,它可以从`bitsandbytes`库很容易的导入。它源于`torch.nn`模块，因此很容易使用和部署至你的模型结构中，如下所示：

下面是逐步的使用例子：假如你要使用`bitsandbytes`转换一个小模型至`int8`精度。

1.  首先需要修改import的代码

```python
import torch
import torch.nn as nn

import bitsandbytes as bnb
from bnb.nn import Linear8bitLt
```

2.  然后需要定义自己的模型。注意你可以从任何精度(FP16,BF16,FP32)准换至`int8`。但模型的输入需要是FP16精度。所以下面为FP16精度的模型。

```python
fp16_model = nn.Sequential(
    nn.Linear(64, 64),
    nn.Linear(64, 64)
)
```

3.  然后可以在自己的数据集和任务上训练模型了，最后保存模型。

```python
[... train the model ...]
torch.save(fp16_model.state_dict(), "model.pt")
```

4.  接下来定义int8的模型

```python
int8_model = nn.Sequential(
    Linear8bitLt(64, 64, has_fp16_weights=False),
    Linear8bitLt(64, 64, has_fp16_weights=False)
)
```

这里加入`has_fp16_weights`的参数是很重要的。因为它默认会被设置为`True`，这意味着它会被作为`Int8/FP16`混合精度训练。然而，我们关心的是`use has_fp16_weights=False`时的计算内存占用。

5.  然后加载模型至8-int精度

```python
int8_model.load_state_dict(torch.load("model.pt"))
int8_model = int8_model.to(0) # 这里量化
```

注意第二行是把模型存入显卡，会执行量化。如果在第二行之前打印`int8_model[0]`的权重，就会发现FP16的精度值

```python
int8_model[0].weight
Parameter containing:
tensor([[ 0.0031, -0.0438,  0.0494,  ..., -0.0046, -0.0410,  0.0436],
        [-0.1013,  0.0394,  0.0787,  ...,  0.0986,  0.0595,  0.0162],
        [-0.0859, -0.1227, -0.1209,  ...,  0.1158,  0.0186, -0.0530],
        ...,
        [ 0.0804,  0.0725,  0.0638,  ..., -0.0487, -0.0524, -0.1076],
        [-0.0200, -0.0406,  0.0663,  ...,  0.0123,  0.0551, -0.0121],
        [-0.0041,  0.0865, -0.0013,  ..., -0.0427, -0.0764,  0.1189]],
       dtype=torch.float16)
```

如果在第二后后面打印`int8_model[0]`的权重，就会发现int8的精度值

```python
int8_model[0].weight
Parameter containing:
tensor([[   3,  -47,   54,  ...,   -5,  -44,   47],
        [-104,   40,   81,  ...,  101,   61,   17],
        [ -89, -127, -125,  ...,  120,   19,  -55],
        ...,
        [  82,   74,   65,  ...,  -49,  -53, -109],
        [ -21,  -42,   68,  ...,   13,   57,  -12],
        [  -4,   88,   -1,  ...,  -43,  -78,  121]],
        device='cuda:0', dtype=torch.int8, requires_grad=True)
```

可以发现权重值被压缩过了，它们分布在`[-127,127]`之间。你可能会好奇做大值矩阵计算FP16时，如何恢复FP16精度权重。可以这样做：

```python
(int8_model[0].weight.CB * int8_model[0].weight.SCB) / 127
```

然后得到

```
tensor([[ 0.0028, -0.0459,  0.0522,  ..., -0.0049, -0.0428,  0.0462],
        [-0.0960,  0.0391,  0.0782,  ...,  0.0994,  0.0593,  0.0167],
        [-0.0822, -0.1240, -0.1207,  ...,  0.1181,  0.0185, -0.0541],
        ...,
        [ 0.0757,  0.0723,  0.0628,  ..., -0.0482, -0.0516, -0.1072],
        [-0.0194, -0.0410,  0.0657,  ...,  0.0128,  0.0554, -0.0118],
        [-0.0037,  0.0859, -0.0010,  ..., -0.0423, -0.0759,  0.1190]],
       device='cuda:0')
```

这和原始的FP16精度权重非常接近。

6.  现在可以在同一个显卡上用FP16精度计算你的模型了

```python
input_ = torch.randn(64, dtype=torch.float16)
hidden_states = int8_model(input_.to(torch.device('cuda', 0)))
```

以上的改动相比较之前的`nn.Linear`模块改动很少，只是把`nn.Parameter`类修改成`bnb.nn.Int8Params`类。但这也会带来一些麻烦，我们后面会介绍。

现在我们介绍如何在`transformers`库中集成功能。

#### accelerate库集成了一切

当用于大模型时，`accelerate`库可以提供很多便利帮助。`init_empty_weights`方法可以帮助任何模型任何尺寸初始化权重，不占用任何内存

```python
import torch.nn as nn
from accelerate import init_empty_weights

with init_empty_weights():
    model = nn.Sequential([nn.Linear(100000, 100000) for _ in range(1000)]) # This will take ~0 RAM!
```

初始化的模型会含有矩阵形状、数据类型，但不真实占用内存的将Pytorch模型放入硬件中。

起初，当调用函数`.from_pretrained`时，会内置将所有参数调用`torch.nn.Parameter`，这不符合我们上面介绍的功能模块`Linear8bitLt`。我们提了PR，将

```python
module._parameters[name] = nn.Parameter(module._parameters[name].to(torch.device("meta")))
```

改为：

```python
param_cls = type(module._parameters[name])
kwargs = module._parameters[name].__dict__
module._parameters[name] = param_cls(module._parameters[name].to(torch.device("meta")), **kwargs)
```

现在，这个问题修好了，我们可以很容易通过`context manager`来初始化，然后用 `bnb.nn.Linear8bitLt`替换`torch.nn.Linear`模块，并且不消耗内存。

```python
def replace_8bit_linear(model, threshold=6.0, module_to_not_convert="lm_head"):
    for name, module in model.named_children():
        if len(list(module.children())) > 0:
            replace_8bit_linear(module, threshold, module_to_not_convert)

        if isinstance(module, nn.Linear) and name != module_to_not_convert:
            with init_empty_weights():
                model._modules[name] = bnb.nn.Linear8bitLt(
                    module.in_features,
                    module.out_features,
                    module.bias is not None,
                    has_fp16_weights=False,
                    threshold=threshold,
                )
    return model
```

上面的函数在初始化模型至硬件时，迭代替换所有层的`nn.Linear`至`bnb.nn.Linear8bitLt`。参数`has_fp16_weights`需要被设置为False，从而直接加载模型权重为int8精度。

#### 配置硬件跑accelerate库

待加载模型并配置到硬件上后，任然有一些配置需要注意。  
`set_module_tensor_to_device`方法是将模型分配到硬件上的。它在`accelerate`库中，通过`dispatch_model`函数实现。而这会被执行多次，需要被避免。两个[Pull Requests](https://github.com/huggingface/accelerate/pull/576/)解决了这个问题，但有几个[测试](https://github.com/huggingface/accelerate/pull/539/)没有通过。

#### 下面是最终的步骤

1.  用正确的模块初始化模型
2.  把参数逐个移到硬件上，确定只移动一次
3.  在对应位置做好注释，并增加一篇正确文档
4.  增加详细的[测试](https://github.com/huggingface/transformers/blob/main/tests/mixed_int8/test_mixed_int8.py)，这可以帮助排查硬件问题，包括CUDA内核问题。

以上就是全部，像做外科手术一样，用另一个库实现了新功能。  
现在来看看这个集成可以带来什么收益，以及在transformers库中如何使用。

### 用transformers库跑混合量化

#### 硬件需要

8-bit tensor不支持CPU。bitsandbytes库可以在`Turing`和`Ampere`架构的GPU上运行，例如RTX 20s, RTX 30s, A40-A100, T4+。在Google Colab上的显卡一般是`NVIDIA T4 GPUs`，这类最新的显卡都支持8-bit tensor。下面就是在Google Colab上使用的例子。

#### 安装

使用下面的命令安装最新的库，使用python需要大于3.8。

```bash
pip install accelerate
pip install bitsandbytes
pip install git+https://github.com/huggingface/transformers.git
```

#### Demo例子

下面的例子是，在`Google Colab`上，使用跑8位精度的BLOOM-3B模型。

[![](/posts-media/8-wei-hun-he-jing-du-ju-zhen-cheng-fa-xiao-ying-jian-pao-da-mo-xing/colab-badge.svg)](https://colab.research.google.com/github/huggingface/blog/blob/main/notebooks/HuggingFace_int8_demo.ipynb)

下面的例子是跑`T5-11B`模型，在FP32精度下，`T5-11B`需要`42GB`的内存，Google Colab上不支持调用这么多内存资源。而通过8-bit精度，可以将内存减少到`11GB`，从而可以在Colab上跑这个模型。

[![](/posts-media/8-wei-hun-he-jing-du-ju-zhen-cheng-fa-xiao-ying-jian-pao-da-mo-xing/colab-badge.svg)](https://colab.research.google.com/drive/1YORPWx4okIHXnjW7MSAidXN29mPVNT7F?usp=sharing)

#### 优化的价值

以上的优化，我们认为极大改善了大模型的适用范围。在不降低推断性能表现下，可以让用户在普通硬件上，使用上从前用不了的大模型。同时我们也发现有几个方向，可以进一步降低大模型的使用门槛。

##### 小模型的推断提速

就像上面benchmark节所见，我们在小模型（<=6B参数量）上改善了推断速度几乎2倍。然而，推断速度在像BLOOM-176B这样的大模型上提速更多，因此小模型仍有很大的提速空间。我们已经提出了Issue议题，且略微提高了一点推断速度。也许过几周就可以集成至库中了。

##### Kepler显卡的支持（GTX 1080）

在过去四年，Transformers库支持了所有的显卡，而一些老显卡如（GTX 1080）仍然被用户重度使用。这些显卡不支持Int8 tensor，他们没有Int8 向量单元。因此这类Kepler显卡做Int8精度提速，就需要整条的软件架构支持，因此需要花更多时间，我们已经列在计划中了。

##### 8位模型在社区的保存

8位的存储权重在上传至社区后，不能直接被加载成8位模型。这是因为在模型上的统计计算是没有存储在权重上的，`Linear8bitLt`暂不支持。我们会考虑未来支持在社区上传这些。

##### CPU支持

CPU硬件不支持8-bit cores。我们可以想什么办法兼容吗？如果能在CPU上运行会让模型门槛更低。

##### 推广到其他领域

一般来说，大模型一般都是语言模型。用这个方法在其他视频、语音、多模态的模型上，可能也会很有趣，它们也许可以在未来几年里继续提高模型的适用范围。

### 感谢

感谢哪些帮助我提高文章可读性和集成至transformers库的朋友们（按照字母排列）  
JustHeuristic (Yozh), Michael Benayoun, Stas Bekman, Steven Liu, Sylvain Gugger, Tim Dettmers
