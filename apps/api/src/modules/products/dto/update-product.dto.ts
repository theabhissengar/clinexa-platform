import { PartialType } from '@nestjs/swagger';

import { CreateProductDto } from './product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {}
